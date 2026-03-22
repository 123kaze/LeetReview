/**
 * Background Service Worker
 * 管理每日复习提醒、数据同步和消息路由
 */

import { createReviewEntry, updateReviewEntry, getTodayReviewList, getReviewStats } from './ebbinghaus.js';
import { getReviewData, setReviewData, getSettings, setSettings, getSyncLog, updateSyncLog, getActivityLog, updateActivityLog } from './storage.js';
import { generateDailySummary, generateHint, diagnoseCode } from './deepseek-api.js';

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
async function proxyLeetCodeAPI(query, variables, endpoint = '/graphql/') {
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
      func: async (gqlQuery, gqlVariables, gqlEndpoint) => {
        try {
          const csrftoken = document.cookie.split('; ').find(row => row.startsWith('csrftoken='))?.split('=')[1] || '';
          const resp = await fetch(`https://leetcode.cn${gqlEndpoint}`, {
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
      args: [query, variables, endpoint]
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
    case 'DIAGNOSE_CODE': return handleDiagnoseCode(msg.problem, msg.code);
    case 'CHECK_LOGIN': return handleCheckLogin();
    case 'GET_REVIEW_DATA': return getReviewData();
    case 'GET_ACTIVITY_LOG': return fetchLeetCodeCalendar();
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

    for (let i = 0; i < allProblems.length; i++) {
      const p = allProblems[i];
      const fid = p.questionFrontendId;
      if (!reviewData[fid]) {
        // 交错排程：前 10 题立刻复习，之后每 10 题推迟 1 天
        const staggerDays = Math.floor(i / 10);
        const startTime = Date.now() - (86400000 * 1); // 伪造 1 天前完成，配合 1 天间隔即立刻到期
        // 但为了简单，我们直接手动设置 nextReview
        const entry = createReviewEntry(p, startTime);
        
        if (i < 10) {
          // 前 10 个直接今天就能看到
          entry.nextReview = Date.now();
        } else {
          // 其余的按批次往后排，每天 10 个
          entry.nextReview = Date.now() + staggerDays * 86400000;
        }
        
        reviewData[fid] = entry;
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
  const settings = await getSettings();
  const limit = settings.maxDailyReview || 20;
  const reviewData = await getReviewData();
  const todayReview = getTodayReviewList(reviewData, limit);
  const stats = getReviewStats(reviewData);
  return { todayReview, stats };
}

async function handleMarkReview(problemId, mastery) {
  const reviewData = await getReviewData();
  const entry = reviewData[problemId];
  if (!entry) return { error: 'Problem not found in review data' };
  reviewData[problemId] = updateReviewEntry(entry, mastery);
  await setReviewData(reviewData);
  await updateActivityLog(1); // 增加每日热力图活跃度
  return { success: true, entry: reviewData[problemId] };
}

async function handleAddProblem(problem) {
  const reviewData = await getReviewData();
  const fid = problem.questionFrontendId || problem.id;
  if (!reviewData[fid]) {
    reviewData[fid] = createReviewEntry(problem, Date.now());
    await setReviewData(reviewData);
    await updateActivityLog(1); // 添加新题也增加一次活跃度
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

async function handleDiagnoseCode(problem, code) {
  const settings = await getSettings();
  if (!settings.deepseekApiKey) return { error: '请先配置 API Key' };
  const diagnosis = await diagnoseCode(settings.deepseekApiKey, problem, code);
  return { diagnosis };
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

/**
 * 获取真实的 LeetCode 提交热力图数据
 */
async function fetchLeetCodeCalendar() {
  const loginData = await handleCheckLogin();
  if (!loginData.isLoggedIn || !loginData.username) {
    const loc = await getActivityLog(); 
    return { ...loc, debugError: 'Not logged in to LeetCode or username missing' };
  }

  try {
    const today = new Date();
    const y = today.getFullYear();
    const m = today.getMonth() + 1;
    
    // Testing multiple strategies to find which one returns data
    const queryV2 = `query ($y: Int!, $m: Int!) {
      userProgressCalendarV2(year: $y, month: $m, queryType: SUBMISSION) {
        dateSubmissionNumWithinMonth { date numSubmitted }
      }
    }`;
    const queryAnnual = `query { getAnnualInfo }`;
    
    let bestData = null;
    let strategy = '';
    
    // 1. Try V2 current month
    const resV2 = await proxyLeetCodeAPI(queryV2, { y, m }, '/graphql/');
    const days = resV2?.data?.userProgressCalendarV2?.dateSubmissionNumWithinMonth || [];
    if (days.length > 0) {
      bestData = days;
      strategy = 'V2-M' + m;
    }
    
    // 2. If V2 failed or only one month, try getAnnualInfo
    if (!bestData) {
      const resAnnual = await proxyLeetCodeAPI(queryAnnual, {}, '/graphql/');
      if (resAnnual?.data?.getAnnualInfo) {
        strategy = 'Annual';
        // Need to parse Annual info if it's a string
      }
    }

    const log = {};
    let debugInfo = `Strat: ${strategy}. Raw: ${JSON.stringify(resV2).substring(0,60)}`;
    
    if (bestData) {
      for (const day of bestData) {
        // userProgressCalendarV2 returns "2026-03-01" or "2026/03/01"
        const ds = String(day.date).replace(/\//g, '-');
        log[ds] = (log[ds] || 0) + day.numSubmitted;
      }
      debugInfo = `Success with ${strategy}. Got ${bestData.length} days.`;
    }

    const loc = await getActivityLog();
    const merged = Object.assign({}, loc, log);
    merged.debugInfo = debugInfo;
    return merged;
    
  } catch (e) {
    console.error('Failed to fetch LeetCode Calendar:', e);
    const loc = await getActivityLog();
    return { ...loc, debugError: 'API Exception: ' + e.message };
  }
}
