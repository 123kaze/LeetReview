import { useState, useEffect } from 'react';
import { sendMessage } from '../chromeApi';

function getDifficultyClass(diff) {
  if (!diff) return '';
  const d = diff.toLowerCase();
  if (d === 'easy' || d === '简单') return 'badge-easy';
  if (d === 'medium' || d === '中等') return 'badge-medium';
  return 'badge-hard';
}

export default function PopupApp() {
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [stats, setStats] = useState(null);
  const [todayReview, setTodayReview] = useState([]);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const data = await sendMessage({ type: 'GET_TODAY' });
      if (data) {
        setStats(data.stats);
        setTodayReview(data.todayReview || []);
      }
    } catch (err) {
      console.error('Load data error:', err);
    }
    setLoading(false);
  }

  async function handleSync() {
    setSyncing(true);
    try {
      const result = await sendMessage({ type: 'SYNC_ALL' });
      if (result?.error) {
        alert('同步失败: ' + result.error);
      } else if (result?.success) {
        alert(`同步成功！共找到 ${result.totalSynced} 道已通过题目，新增 ${result.newAdded} 道复习计划。`);
        await loadData();
      }
    } catch (err) {
      console.error('Sync error:', err);
      alert('同步出错: ' + err.message);
    }
    setSyncing(false);
  }

  function openDashboard() {
    const url = chrome?.runtime?.getURL
      ? chrome.runtime.getURL('dist/dashboard.html')
      : '/dashboard.html';
    window.open(url, '_blank');
  }

  if (loading) {
    return (
      <div className="popup-container">
        <div className="popup-header">
          <h1>📖 LeetReview</h1>
          <p>艾宾浩斯复习助手</p>
        </div>
        <div className="popup-status">
          <div className="spinner" />
          <p>加载中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="popup-container">
      {/* Header */}
      <div className="popup-header">
        <h1>📖 LeetReview</h1>
        <p>科学复习 · 高效刷题</p>
      </div>

      {/* Stats */}
      <div className="stats-row">
        <div className="stat-card animate-fade-in" style={{ animationDelay: '0.1s' }}>
          <span className="stat-number review">{stats?.dueToday ?? 0}</span>
          <span className="stat-label">今日复习</span>
        </div>
        <div className="stat-card animate-fade-in" style={{ animationDelay: '0.2s' }}>
          <span className="stat-number total">{stats?.total ?? 0}</span>
          <span className="stat-label">总题数</span>
        </div>
        <div className="stat-card animate-fade-in" style={{ animationDelay: '0.3s' }}>
          <span className="stat-number mastered">{stats?.mastered ?? 0}</span>
          <span className="stat-label">已掌握</span>
        </div>
      </div>

      {/* Preview List */}
      {todayReview.length > 0 && (
        <div className="review-preview animate-fade-in" style={{ animationDelay: '0.4s' }}>
          <h3>⏰ 待复习</h3>
          {todayReview.slice(0, 4).map((item) => (
            <div className="preview-item" key={item.id}>
              <span className="id-tag">#{item.id}</span>
              <span className="title">{item.title}</span>
              <span className={`badge ${getDifficultyClass(item.difficulty)}`}>
                {item.difficulty || '?'}
              </span>
            </div>
          ))}
          {todayReview.length > 4 && (
            <div style={{ textAlign: 'center', paddingTop: 4 }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                还有 {todayReview.length - 4} 道...
              </span>
            </div>
          )}
        </div>
      )}

      {todayReview.length === 0 && (
        <div className="review-preview animate-fade-in" style={{ animationDelay: '0.4s', textAlign: 'center', padding: '20px' }}>
          <p style={{ fontSize: 32, marginBottom: 8 }}>🎉</p>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>今日无需复习，太棒了！</p>
        </div>
      )}

      {/* Actions */}
      <div className="popup-actions">
        <button className="btn btn-primary" onClick={openDashboard}>
          🚀 打开 Dashboard
        </button>
        <button
          className="btn btn-secondary"
          onClick={handleSync}
          disabled={syncing}
        >
          {syncing ? '⏳ 同步中...' : '🔄 同步刷题数据'}
        </button>
      </div>

      {/* Footer */}
      <div className="popup-footer">
        <a href="#" onClick={openDashboard}>设置 & 更多 →</a>
      </div>
    </div>
  );
}
