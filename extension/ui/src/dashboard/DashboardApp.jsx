import { useState, useEffect } from 'react';
import { sendMessage } from '../chromeApi';

function getDifficultyClass(diff) {
  if (!diff) return '';
  const d = diff.toLowerCase();
  if (d === 'easy' || d === '简单') return 'badge-easy';
  if (d === 'medium' || d === '中等') return 'badge-medium';
  return 'badge-hard';
}

export default function DashboardApp() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);
  const [todayReview, setTodayReview] = useState([]);
  const [todayNew, setTodayNew] = useState([]);
  
  const [aiSummary, setAiSummary] = useState('');
  const [generatingSummary, setGeneratingSummary] = useState(false);
  
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState({ deepseekApiKey: '', dailyNewCount: 3 });

  useEffect(() => {
    loadData();
    loadSettings();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const data = await sendMessage({ type: 'GET_TODAY' });
      if (data) {
        setStats(data.stats);
        setTodayReview(data.todayReview || []);
      }
      const rec = await sendMessage({ type: 'GET_RECOMMENDED' });
      if (rec) setTodayNew(rec.recommended || []);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  }

  async function loadSettings() {
    const s = await sendMessage({ type: 'GET_SETTINGS' });
    if (s) setSettings(s);
  }

  async function saveSettings() {
    await sendMessage({ type: 'SAVE_SETTINGS', settings });
    setShowSettings(false);
  }

  async function handleMarkReview(id, mastery) {
    try {
      const res = await sendMessage({ type: 'MARK_REVIEW', problemId: id, mastery });
      if (res?.success) {
        // remove from local state
        setTodayReview(prev => prev.filter(p => String(p.id) !== String(id)));
        setStats(prev => ({ ...prev, dueToday: Math.max(0, prev.dueToday - 1) }));
      }
    } catch (err) {
      console.error(err);
    }
  }

  async function demandDailySummary() {
    setGeneratingSummary(true);
    try {
      const res = await sendMessage({ type: 'GENERATE_SUMMARY' });
      if (res?.summary) {
        setAiSummary(res.summary);
      } else if (res?.error) {
        alert('生成失败: ' + res.error);
      }
    } catch (err) {
      console.error(err);
    }
    setGeneratingSummary(false);
  }

  async function handleAskHint(problem) {
    // Check if key exists
    if (!settings.deepseekApiKey) {
      alert("请先配置 DeepSeek API Key");
      setShowSettings(true);
      return;
    }

    const res = await sendMessage({ type: 'GENERATE_HINT', problem, level: 1 });
    if (res?.hint) {
      alert(`🤖 DeepSeek 提示:\n\n${res.hint}`);
    } else {
      alert('获取提示失败: ' + (res?.error || 'Unknown error'));
    }
  }

  if (loading) {
    return (
      <div className="dashboard-container" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <h2 className="animate-pulse">加载数据中...</h2>
      </div>
    );
  }

  return (
    <div className="dashboard-container">
      {/* Header */}
      <header className="dashboard-header">
        <div className="header-left">
          <h1 className="gradient-text">LeetReview Dashboard</h1>
          <p>基于艾宾浩斯记忆曲线的智能刷题管家</p>
        </div>
        <div className="header-right">
          <button className="btn btn-secondary" onClick={() => setShowSettings(true)}>
            ⚙️ 设置
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="dashboard-content">
        
        {/* Left Column: Task Lists */}
        <div className="left-col animate-fade-in" style={{ animationDelay: '0.1s' }}>
          
          <h2 className="section-title">
            ⏰ 今日待复习
            <span className="count">{todayReview.length}</span>
          </h2>

          <div className="task-list">
            {todayReview.length === 0 ? (
              <div className="glass-card" style={{ padding: 40, textAlign: 'center' }}>
                <p style={{ fontSize: 40, marginBottom: 16 }}>🎉</p>
                <h3 style={{ color: 'var(--text-primary)', marginBottom: 8 }}>所有复习任务已完成！</h3>
                <p style={{ color: 'var(--text-secondary)' }}>去学习新的知识点吧～</p>
              </div>
            ) : (
              todayReview.map(item => (
                <div className="task-item" key={item.id}>
                  <div className="task-info">
                    <div className="task-header">
                      <span className="task-id">#{item.id}</span>
                      <a 
                        href={`https://leetcode.cn/problems/${item.titleSlug}/`} 
                        target="_blank" 
                        rel="noreferrer"
                        className="task-title"
                      >
                        {item.title}
                      </a>
                      <span className={`badge ${getDifficultyClass(item.difficulty)}`}>
                        {item.difficulty || 'Unknown'}
                      </span>
                    </div>
                    <div className="task-tags">
                      {(item.topicTags || []).map(tag => (
                       <span key={tag.slug} className="tag">{tag.nameTranslated || tag.name}</span> 
                      ))}
                      <span className="tag" style={{ color: 'var(--accent-warning)', border: '1px solid currentColor' }}>
                        复习第 {item.reviewCount + 1} 次
                      </span>
                    </div>
                  </div>
                  <div className="task-actions">
                    <button className="btn btn-secondary btn-sm" onClick={() => handleAskHint(item)}>
                      💡 提示
                    </button>
                    <button className="btn btn-success btn-sm" onClick={() => handleMarkReview(item.id, 'easy')}>
                      轻松
                    </button>
                    <button className="btn" style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: 12, borderRadius: 8 }} onClick={() => handleMarkReview(item.id, 'normal')}>
                      一般
                    </button>
                    <button className="btn btn-danger btn-sm" onClick={() => handleMarkReview(item.id, 'hard')}>
                      困难
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          <h2 className="section-title" style={{ marginTop: 40 }}>
            🌱 今日新学推荐 (基于 mt.md 路线)
          </h2>
          <div className="task-list">
            {todayNew.length === 0 ? (
              <div className="glass-card" style={{ padding: 20, textAlign: 'center' }}>
                <p style={{ color: 'var(--text-secondary)' }}>暂无新题推荐</p>
              </div>
            ) : (
              todayNew.map(item => (
                <div className="task-item" key={item.id}>
                  <div className="task-info">
                    <div className="task-header">
                      <span className="task-id">#{item.id}</span>
                      <a 
                        href={`https://leetcode.cn/problems/${item.titleSlug}/`} 
                        target="_blank" 
                        rel="noreferrer"
                        className="task-title"
                      >
                        {item.title}
                      </a>
                      <span className={`badge ${getDifficultyClass(item.difficulty)}`}>
                        {item.difficulty || 'Unknown'}
                      </span>
                    </div>
                    <div className="task-tags">
                      {(item.topicTags || []).map(tag => (
                       <span key={tag.slug || tag.name} className="tag">{tag.nameTranslated || tag.name}</span> 
                      ))}
                    </div>
                  </div>
                  <div className="task-actions">
                    <a className="btn btn-primary btn-sm" href={`https://leetcode.cn/problems/${item.titleSlug}/`} target="_blank" rel="noreferrer">
                      去挑战 🚀
                    </a>
                  </div>
                </div>
              ))
            )}
          </div>

        </div>

        {/* Right Column: AI Panel & Stats */}
        <div className="right-col ai-panel animate-fade-in" style={{ animationDelay: '0.2s' }}>
          
          <div className="glass-card ai-card">
            <div className="ai-header">
              <div className="ai-icon">🤖</div>
              <h3 style={{ fontSize: 18, fontWeight: 700 }}>DeepSeek 导师</h3>
            </div>
            
            {aiSummary ? (
              <div className="ai-content">
                {aiSummary}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '20px 0' }}>
                <p style={{ color: 'var(--text-secondary)', marginBottom: 16, fontSize: 14 }}>
                  开启智能导师，获取每日专属学习建议。
                </p>
                <button 
                  className="btn btn-primary" 
                  onClick={demandDailySummary}
                  disabled={generatingSummary}
                >
                  {generatingSummary ? '正在生成...' : '生成今日学情总结'}
                </button>
              </div>
            )}
          </div>

          <div className="glass-card" style={{ padding: 24 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>刷题数据分析</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div className="stat-card" style={{ background: 'var(--bg-secondary)', border: 'none' }}>
                <span className="stat-number">{stats?.total ?? 0}</span>
                <span className="stat-label">总做题</span>
              </div>
              <div className="stat-card" style={{ background: 'rgba(46, 213, 115, 0.1)', border: '1px solid rgba(46, 213, 115, 0.2)' }}>
                <span className="stat-number" style={{ color: 'var(--accent-success)' }}>{stats?.mastered ?? 0}</span>
                <span className="stat-label">已永久掌握</span>
              </div>
            </div>
            <div style={{ marginTop: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 12, color: 'var(--text-secondary)' }}>
                <span>复习健康度</span>
                <span>{(stats?.total > 0 ? (stats.mastered / stats.total * 100).toFixed(1) : 0)}%</span>
              </div>
              <div style={{ height: 6, background: 'var(--bg-secondary)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ width: `${stats?.total > 0 ? (stats.mastered / stats.total * 100) : 0}%`, height: '100%', background: 'var(--gradient-hero)' }} />
              </div>
            </div>
          </div>

        </div>

      </main>

      {/* Settings Modal */}
      {showSettings && (
        <div className="modal-overlay" onClick={(e) => { if(e.target === e.currentTarget) setShowSettings(false); }}>
          <div className="modal-content">
            <div className="modal-header">
              <h2 className="modal-title">⚙️ 插件设置</h2>
              <button className="close-btn" onClick={() => setShowSettings(false)}>×</button>
            </div>
            
            <div className="form-group">
              <label className="form-label">DeepSeek API Key</label>
              <input 
                type="password" 
                className="input-field" 
                placeholder="sk-xxxxxxxxxxxxxxxxxxxxxxxx"
                value={settings.deepseekApiKey || ''}
                onChange={e => setSettings({...settings, deepseekApiKey: e.target.value})}
              />
              <p className="form-hint">用于接入智能提示和每日学情总结。申请地址: platform.deepseek.com</p>
            </div>

            <div className="form-group">
              <label className="form-label">每日推荐新题数量</label>
              <input 
                type="number" 
                className="input-field" 
                min="0" max="10"
                value={settings.dailyNewCount || 3}
                onChange={e => setSettings({...settings, dailyNewCount: parseInt(e.target.value, 10)})}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 32 }}>
              <button className="btn btn-secondary" onClick={() => setShowSettings(false)}>取消</button>
              <button className="btn btn-primary" onClick={saveSettings}>保存设置</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
