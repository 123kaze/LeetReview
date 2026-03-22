/**
 * 与 Chrome Extension background 通信的工具函数
 * 开发模式下使用 mock 数据
 */

const isDev = !window.chrome?.runtime?.sendMessage;

// ─── Mock Data for Development ───
const mockReviewData = {
  '1': { id: '1', titleSlug: 'two-sum', title: '两数之和', difficulty: 'Easy', topicTags: [{ name: 'Array', nameTranslated: '数组' }], reviewCount: 2, mastery: 'easy', nextReview: Date.now() - 86400000, retired: false, easyStreak: 2 },
  '3': { id: '3', titleSlug: 'longest-substring-without-repeating-characters', title: '无重复字符的最长子串', difficulty: 'Medium', topicTags: [{ name: 'Sliding Window', nameTranslated: '滑动窗口' }], reviewCount: 1, mastery: 'normal', nextReview: Date.now() - 3600000, retired: false, easyStreak: 0 },
  '42': { id: '42', titleSlug: 'trapping-rain-water', title: '接雨水', difficulty: 'Hard', topicTags: [{ name: 'Stack', nameTranslated: '栈' }], reviewCount: 0, mastery: 'hard', nextReview: Date.now() - 7200000, retired: false, easyStreak: 0 },
  '70': { id: '70', titleSlug: 'climbing-stairs', title: '爬楼梯', difficulty: 'Easy', topicTags: [{ name: 'Dynamic Programming', nameTranslated: '动态规划' }], reviewCount: 5, mastery: 'easy', nextReview: Date.now() + 86400000 * 30, retired: true, easyStreak: 4 },
  '200': { id: '200', titleSlug: 'number-of-islands', title: '岛屿数量', difficulty: 'Medium', topicTags: [{ name: 'DFS', nameTranslated: '深度优先搜索' }], reviewCount: 1, mastery: 'hard', nextReview: Date.now() - 1800000, retired: false, easyStreak: 0 },
  '53': { id: '53', titleSlug: 'maximum-subarray', title: '最大子数组和', difficulty: 'Medium', topicTags: [{ name: 'Dynamic Programming', nameTranslated: '动态规划' }], reviewCount: 3, mastery: 'normal', nextReview: Date.now() - 100000, retired: false, easyStreak: 0 },
};

const mockStats = { total: 6, dueToday: 5, retired: 1, mastered: 1 };

/**
 * 统一消息发送函数
 */
export function sendMessage(msg) {
  if (isDev) return handleMockMessage(msg);
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(msg, resolve);
  });
}

function handleMockMessage(msg) {
  return new Promise((resolve) => {
    setTimeout(() => {
      switch (msg.type) {
        case 'GET_TODAY': {
          const due = Object.values(mockReviewData).filter(e => !e.retired && e.nextReview <= Date.now());
          resolve({ todayReview: due, stats: mockStats });
          break;
        }
        case 'GET_STATS':
          resolve(mockStats);
          break;
        case 'GET_RECOMMENDED':
          resolve({
            recommended: [
              { id: '121', titleSlug: 'best-time-to-buy-and-sell-stock', title: '买卖股票的最佳时机', difficulty: 'Easy', topicTags: [{ name: 'Array' }, { name: 'Dynamic Programming' }] },
              { id: '20', titleSlug: 'valid-parentheses', title: '有效的括号', difficulty: 'Easy', topicTags: [{ name: 'Stack' }] },
            ]
          });
          break;
        case 'GET_SETTINGS':
          resolve({ deepseekApiKey: '', dailyNewCount: 3, maxDailyReview: 20, enableNotifications: true, currentTopic: '', difficultyMax: 1700 });
          break;
        case 'SAVE_SETTINGS':
          resolve({ success: true });
          break;
        case 'SYNC_ALL':
          resolve({ success: true, totalSynced: 42, newAdded: 5 });
          break;
        case 'MARK_REVIEW':
          resolve({ success: true });
          break;
        case 'GENERATE_SUMMARY':
          resolve({ summary: '🌟 今天你有5道题需要复习，其中包含1道Hard难度的「接雨水」。建议先从熟悉的Easy题目开始热身，再挑战Hard。加油，坚持就是胜利！💪' });
          break;
        case 'GENERATE_HINT':
          resolve({ hint: '💡 提示：这道题可以考虑使用双指针或者单调栈的方法。想想看，对于每个位置，它能接的雨水取决于什么？' });
          break;
        case 'CHECK_LOGIN':
          resolve({ isLoggedIn: true, username: 'demo_user' });
          break;
        case 'GET_REVIEW_DATA':
          resolve(mockReviewData);
          break;
        case 'GET_ACTIVITY_LOG': {
          const mockLog = {};
          const today = new Date();
          for(let i=0; i<60; i++) {
             const d = new Date(today);
             d.setDate(d.getDate() - i);
             const ds = d.toISOString().split('T')[0];
             mockLog[ds] = Math.floor(Math.random() * 5); // 0-4 reviews randomly
          }
          resolve(mockLog);
          break;
        }
        case 'DIAGNOSE_CODE':
          resolve({ diagnosis: '1. 时间复杂度：O(N)\\n2. 空间复杂度：O(1)\\n3. 优化建议：代码已经很不错了，这里可以用双指针进一步优化冗余循环。' });
          break;
        default:
          resolve({ error: 'Unknown' });
      }
    }, 300);
  });
}
