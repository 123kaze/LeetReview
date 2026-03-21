/**
 * 艾宾浩斯遗忘曲线调度引擎
 * 管理复习间隔和题目状态
 */

// 默认复习间隔（天）
const DEFAULT_INTERVALS = [1, 2, 4, 7, 15, 30, 60];

// 掌握程度对下次间隔的倍率
const MASTERY_MULTIPLIERS = {
  easy: 1.5,    // 轻松掌握 → 延长间隔
  normal: 1.0,  // 一般 → 正常间隔
  hard: 0.5     // 困难 → 缩短间隔
};

/**
 * 创建一条新的复习记录
 * @param {Object} problem - 题目信息
 * @param {number} firstAcceptedTimestamp - 首次通过时间戳(ms)
 * @returns {Object} 复习记录
 */
export function createReviewEntry(problem, firstAcceptedTimestamp) {
  const now = firstAcceptedTimestamp || Date.now();
  return {
    id: problem.questionFrontendId || problem.id,
    titleSlug: problem.titleSlug,
    title: problem.translatedTitle || problem.title,
    difficulty: problem.difficulty,
    topicTags: problem.topicTags || [],
    firstAccepted: now,
    reviewCount: 0,
    nextReview: now + DEFAULT_INTERVALS[0] * 86400000, // 1天后
    lastReview: null,
    mastery: 'normal', // easy | normal | hard
    intervalIndex: 0,
    retired: false // 连续多次 easy 后可退休
  };
}

/**
 * 计算下一次复习时间
 * @param {Object} entry - 复习记录
 * @param {string} mastery - 掌握程度: 'easy' | 'normal' | 'hard'
 * @returns {Object} 更新后的复习记录
 */
export function updateReviewEntry(entry, mastery = 'normal') {
  const multiplier = MASTERY_MULTIPLIERS[mastery] || 1.0;
  let newIndex = entry.intervalIndex;

  if (mastery === 'easy') {
    newIndex = Math.min(newIndex + 2, DEFAULT_INTERVALS.length - 1);
  } else if (mastery === 'hard') {
    newIndex = Math.max(newIndex - 1, 0);
  } else {
    newIndex = Math.min(newIndex + 1, DEFAULT_INTERVALS.length - 1);
  }

  const baseInterval = DEFAULT_INTERVALS[newIndex];
  const adjustedDays = Math.round(baseInterval * multiplier);
  const now = Date.now();

  // 连续3次以上 easy 且已达最大间隔 → 退休
  const easyStreak = (entry.easyStreak || 0) + (mastery === 'easy' ? 1 : 0);
  const retired = easyStreak >= 3 && newIndex >= DEFAULT_INTERVALS.length - 1;

  return {
    ...entry,
    reviewCount: entry.reviewCount + 1,
    lastReview: now,
    nextReview: now + adjustedDays * 86400000,
    mastery,
    intervalIndex: newIndex,
    easyStreak: mastery === 'easy' ? easyStreak : 0,
    retired
  };
}

/**
 * 获取今日需要复习的题目
 * @param {Object} reviewData - 所有复习记录  { [id]: entry }
 * @returns {Array} 今日复习列表
 */
export function getTodayReviewList(reviewData) {
  const now = Date.now();
  const today = [];

  for (const [id, entry] of Object.entries(reviewData)) {
    if (entry.retired) continue;
    if (entry.nextReview <= now) {
      today.push(entry);
    }
  }

  // 按优先级排序：hard > normal > easy，再按下次复习时间排
  const masteryOrder = { hard: 0, normal: 1, easy: 2 };
  today.sort((a, b) => {
    const ma = masteryOrder[a.mastery] ?? 1;
    const mb = masteryOrder[b.mastery] ?? 1;
    if (ma !== mb) return ma - mb;
    return a.nextReview - b.nextReview;
  });

  return today;
}

/**
 * 获取复习统计概览
 * @param {Object} reviewData
 * @returns {Object} 统计信息
 */
export function getReviewStats(reviewData) {
  const now = Date.now();
  let total = 0, dueToday = 0, retired = 0, mastered = 0;

  for (const entry of Object.values(reviewData)) {
    total++;
    if (entry.retired) { retired++; continue; }
    if (entry.nextReview <= now) dueToday++;
    if (entry.reviewCount >= 3 && entry.mastery === 'easy') mastered++;
  }

  return { total, dueToday, retired, mastered };
}
