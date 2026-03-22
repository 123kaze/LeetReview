/**
 * Chrome Storage 帮助函数
 * 封装 chrome.storage.local 读写操作
 */

const STORAGE_KEYS = {
  REVIEW_DATA: 'leetreview_reviewData',
  SETTINGS: 'leetreview_settings',
  SYNC_LOG: 'leetreview_syncLog',
  DAILY_CACHE: 'leetreview_dailyCache',
  ACTIVITY_LOG: 'leetreview_activityLog'
};

/**
 * 读取存储数据
 */
export function storageGet(key) {
  return new Promise((resolve) => {
    chrome.storage.local.get([key], (result) => {
      resolve(result[key] ?? null);
    });
  });
}

/**
 * 写入存储数据
 */
export function storageSet(key, value) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [key]: value }, resolve);
  });
}

/**
 * 获取所有复习数据
 * @returns {Promise<Object>} { [problemId]: ReviewEntry }
 */
export async function getReviewData() {
  return (await storageGet(STORAGE_KEYS.REVIEW_DATA)) || {};
}

/**
 * 保存所有复习数据
 */
export async function setReviewData(data) {
  return storageSet(STORAGE_KEYS.REVIEW_DATA, data);
}

/**
 * 获取插件设置
 */
export async function getSettings() {
  const defaults = {
    deepseekApiKey: '',
    dailyNewCount: 3,
    maxDailyReview: 20,
    enableNotifications: true,
    currentTopic: '',
    difficultyMax: 1700
  };
  const saved = (await storageGet(STORAGE_KEYS.SETTINGS)) || {};
  return { ...defaults, ...saved };
}

/**
 * 保存插件设置
 */
export async function setSettings(settings) {
  return storageSet(STORAGE_KEYS.SETTINGS, settings);
}

/**
 * 获取同步日志
 */
export async function getSyncLog() {
  return (await storageGet(STORAGE_KEYS.SYNC_LOG)) || { lastSync: null, count: 0 };
}

/**
 * 更新同步日志
 */
export async function updateSyncLog(count) {
  return storageSet(STORAGE_KEYS.SYNC_LOG, {
    lastSync: Date.now(),
    count
  });
}

/**
 * 获取活动日志 (热力图)
 */
export async function getActivityLog() {
  return (await storageGet(STORAGE_KEYS.ACTIVITY_LOG)) || {};
}

/**
 * 更新活动日志
 */
export async function updateActivityLog(count = 1) {
  const log = await getActivityLog();
  const dateStr = new Date().toISOString().split('T')[0];
  log[dateStr] = (log[dateStr] || 0) + count;
  await storageSet(STORAGE_KEYS.ACTIVITY_LOG, log);
  return log;
}

export { STORAGE_KEYS };
