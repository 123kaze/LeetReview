/**
 * Background Service Worker
 * 管理每日复习提醒、数据同步和消息路由
 */

import { createReviewEntry, updateReviewEntry, getTodayReviewList, getReviewStats } from './ebbinghaus.js';
import { getReviewData, setReviewData, getSettings, setSettings, getSyncLog, updateSyncLog } from './storage.js';
import { generateDailySummary, generateHint } from './deepseek-api.js';

// ─── 初始化定时器 ───
chrome.runtime.onInstalled.addListener(() => {
  console.log('[LeetReview] Extension installed');
  chrome.alarms.create('dailyReviewCheck', {
    periodInMinutes: 60,
    delayInMinutes: 1
  });
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'dailyReviewCheck') {
    const reviewData = await getReviewData();
    const todayList = getTodayReviewList(reviewData);
    const settings = await getSettings();

    if (todayList.length > 0 && settings.enableNotifications) {
      chrome.action.setBadgeText({ text: String(todayList.length) });
      chrome.action.setBadgeBackgroundColor({ color: '#FF6B6B' });
    } else {
      chrome.action.setBadgeText({ text: '' });
    }
  }
});

// ─── 使用 chrome.scripting.executeScript 在 leetcode.cn 页面上下文中执行 fetch ───
async function proxyLeetCodeAPI(query, variables) {
  let tabs = await chrome.tabs.query({ url: 'https://leetcode.cn/*' });
  let tabId;
  let autoOpened = false;

  if (tabs.length > 0) {
    tabId = tabs[0].id;
  } else {
    const newTab = await chrome.tabs.create({ url: 'https://leetcode.cn/problemset/', active: false });
    tabId = newTab.id;
    autoOpened = true;

    await new Promise((resolve) => {
      const listener = (updatedTabId, info) => {
        if (updatedTabId === tabId && info.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      };
      chrome.tabs.onUpdated.addListener(listener);
    });

    await new Promise(r => setTimeout(r, 2000));
  }

  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: async (gqlQuery, gqlVariables) => {
        try {
          const csrftoken = document.cookie.split('; ').find(row => row.startsWith('csrftoken='))?.split('=')[1] || '';
          const resp = await fetch('https://leetcode.cn/graphql/', {
            method: 'POST',
            credentials: 'include',
            headers: { 
              'Content-Type': 'application/json',
              'x-csrftoken': csrftoken
            },
            body: JSON.stringify({ query: gqlQuery, variables: gqlVariables })
          });
          if (!resp.ok) {
            const text = await resp.text();
            return { error: `HTTP ${resp.status}: ${text.substring(0, 200)}` };
          }
          return await resp.json();
        } catch (e) {
          return { error: e.message };
        }
      },
      args: [query, variables]
    });

    if (autoOpened) {
      try { await chrome.tabs.remove(tabId); } catch (e) { /* ignore */ }
    }

    if (results && results[0]) {
      console.log('[LeetReview] executeScript returned:', results[0].result);
      return results[0].result;
    }
    return { error: '执行脚本未返回结果 (results array empty)' };
  } catch (err) {
    if (autoOpened) {
      try { await chrome.tabs.remove(tabId); } catch (e) { /* ignore */ }
    }
    console.error('[LeetReview] executeScript error:', err);
    throw err;
  }
}

// ─── 消息路由 ───
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'PROXY_GRAPHQL') return;

  handleMessage(msg).then(sendResponse).catch(err => {
    console.error('[LeetReview] Message error:', err);
    sendResponse({ error: err.message });
  });
  return true;
});

async function handleMessage(msg) {
  switch (msg.type) {
    case 'SYNC_ALL': return handleSyncAll();
    case 'GET_TODAY': return handleGetToday();
    case 'MARK_REVIEW': return handleMarkReview(msg.problemId, msg.mastery);
    case 'ADD_PROBLEM': return handleAddProblem(msg.problem);
    case 'GET_STATS': return handleGetStats();
    case 'GET_RECOMMENDED': return handleGetRecommended();
    case 'GET_SETTINGS': return getSettings();
    case 'SAVE_SETTINGS': {
      await setSettings(msg.settings);
      return { success: true };
    }
    case 'GENERATE_SUMMARY': return handleGenerateSummary();
    case 'GENERATE_HINT': return handleGenerateHint(msg.problem, msg.level);
    case 'CHECK_LOGIN': return handleCheckLogin();
    case 'GET_REVIEW_DATA': return getReviewData();
    default: return { error: 'Unknown message type' };
  }
}

// ─── GraphQL 查询模板（与 leetcode周赛显示.js 完全一致） ───
const ALL_PROBLEMS_QUERY = `
  query problemsetQuestionListV2($filters: QuestionFilterInput, $limit: Int, $searchKeyword: String, $skip: Int, $sortBy: QuestionSortByInput, $categorySlug: String) {
    problemsetQuestionListV2(
      filters: $filters
      limit: $limit
      searchKeyword: $searchKeyword
      skip: $skip
      sortBy: $sortBy
      categorySlug: $categorySlug
    ) {
      questions {
        id
        titleSlug
        title
        translatedTitle
        questionFrontendId
        paidOnly
        difficulty
        topicTags { name slug nameTranslated }
        status
        acRate
      }
      totalLength
      finishedLength
      hasMore
    }
  }`;



const USER_PROFILE_QUERY = `
  query globalData {
    userStatus { isSignedIn username realName avatar }
  }`;

/**
 * 全量同步已通过的题目
 * 拉取所有题目，筛选 status === 'ac' 的（已通过）
 */
async function handleSyncAll() {
  try {
    const allProblems = [];
    let skip = 0;
    const limit = 100;
    let hasMore = true;

    while (hasMore) {
      const variables = {
        categorySlug: 'all-code-essentials',
        searchKeyword: '',
        skip,
        limit,
        filters: { filterCombineType: 'ALL' },
        sortBy: { sortField: 'CUSTOM', sortOrder: 'ASCENDING' }
      };

      console.log(`[LeetReview] Fetching ALL problems skip=${skip}...`);
      const data = await proxyLeetCodeAPI(ALL_PROBLEMS_QUERY, variables);

      if (data?.error) {
        console.error('[LeetReview] API error:', data.error);
        throw new Error(data.error);
      }

      const list = data?.data?.problemsetQuestionListV2;
      if (!list || !list.questions || list.questions.length === 0) break;

      // 本地筛选出已通过的题目（因为刚才带上了 CSRF token，现在 status 字段有值了）
      const acList = list.questions.filter(q => 
        q.status === 'ac' || q.status === 'AC' || q.status === 'SOLVED' || q.status === 'ACCEPTED'
      );
      allProblems.push(...acList);

      hasMore = list.hasMore;
      skip += limit;
    }

    console.log(`[LeetReview] Found ${allProblems.length} AC problems`);

    const reviewData = await getReviewData();
    let newCount = 0;

    for (const p of allProblems) {
      const fid = p.questionFrontendId;
      if (!reviewData[fid]) {
        reviewData[fid] = createReviewEntry(p, Date.now());
        newCount++;
      }
    }

    await setReviewData(reviewData);
    await updateSyncLog(allProblems.length);

    return { success: true, totalSynced: allProblems.length, newAdded: newCount };
  } catch (err) {
    console.error('[LeetReview] Sync error:', err);
    return { error: `同步失败: ${err.message}。请确保已登录 leetcode.cn 并有一个力扣标签页打开。` };
  }
}

async function handleGetToday() {
  const reviewData = await getReviewData();
  const todayReview = getTodayReviewList(reviewData);
  const stats = getReviewStats(reviewData);
  return { todayReview, stats };
}

async function handleMarkReview(problemId, mastery) {
  const reviewData = await getReviewData();
  const entry = reviewData[problemId];
  if (!entry) return { error: 'Problem not found in review data' };
  reviewData[problemId] = updateReviewEntry(entry, mastery);
  await setReviewData(reviewData);
  return { success: true, entry: reviewData[problemId] };
}

async function handleAddProblem(problem) {
  const reviewData = await getReviewData();
  const fid = problem.questionFrontendId || problem.id;
  if (!reviewData[fid]) {
    reviewData[fid] = createReviewEntry(problem, Date.now());
    await setReviewData(reviewData);
    return { success: true, isNew: true };
  }
  return { success: true, isNew: false };
}

async function handleGetRecommended() {
  const settings = await getSettings();
  try {
    const variables = {
      categorySlug: 'all-code-essentials',
      searchKeyword: '',
      skip: Math.floor(Math.random() * 2000), // 防止全命中已做过的题，在 2000 题内随机跳过
      limit: 50, // 增加单次拉取数量以确保能筛出够不够的未做题目
      filters: { filterCombineType: 'ALL' },
      sortBy: { sortField: 'CUSTOM', sortOrder: 'ASCENDING' }
    };
    const data = await proxyLeetCodeAPI(ALL_PROBLEMS_QUERY, variables);
    const qs = (data?.data?.problemsetQuestionListV2?.questions || [])
      .filter(q => {
        // 只推荐未通过的题目
        if (q.status === 'ac' || q.status === 'AC' || q.status === 'SOLVED' || q.status === 'ACCEPTED') return false;
        // 过滤掉数据库和 Shell 脚本题目（符合 mt.md 纯算法路线建议）
        const hasDbOrShell = (q.topicTags || []).some(t => t.slug === 'database' || t.slug === 'shell');
        return !hasDbOrShell;
      });
    return { recommended: qs.slice(0, settings.dailyNewCount || 3) };
  } catch (e) {
    return { recommended: [] };
  }
}

async function handleGetStats() {
  const reviewData = await getReviewData();
  return getReviewStats(reviewData);
}

async function handleGenerateSummary() {
  const settings = await getSettings();
  if (!settings.deepseekApiKey) return { error: '请先在设置中配置 DeepSeek API Key' };
  const reviewData = await getReviewData();
  const todayReview = getTodayReviewList(reviewData);
  const stats = getReviewStats(reviewData);
  const summary = await generateDailySummary(settings.deepseekApiKey, stats, todayReview, []);
  return { summary };
}

async function handleGenerateHint(problem, level) {
  const settings = await getSettings();
  if (!settings.deepseekApiKey) return { error: '请先在设置中配置 DeepSeek API Key' };
  const hint = await generateHint(settings.deepseekApiKey, problem, level);
  return { hint };
}

async function handleCheckLogin() {
  try {
    const data = await proxyLeetCodeAPI(USER_PROFILE_QUERY, {});
    const us = data?.data?.userStatus;
    return { isLoggedIn: !!us?.isSignedIn, username: us?.username };
  } catch {
    return { isLoggedIn: false };
  }
}
