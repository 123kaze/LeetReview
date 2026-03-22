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
  const [settings, setSettings] = useState({ deepseekApiKey: '', dailyNewCount: 3, maxDailyReview: 20 });

  // Heatmap & Diagnosis States
  const [activityLog, setActivityLog] = useState({});
  const [showDiagnose, setShowDiagnose] = useState(false);
  const [diagnoseProblem, setDiagnoseProblem] = useState(null);
  const [diagnoseCode, setDiagnoseCode] = useState('');
  const [diagnoseResult, setDiagnoseResult] = useState('');
  const [diagnosing, setDiagnosing] = useState(false);

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
      const log = await sendMessage({ type: 'GET_ACTIVITY_LOG' });
      if (log) setActivityLog(log);
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

  function openDiagnose(item) {
    setDiagnoseProblem(item);
    setDiagnoseCode('');
    setDiagnoseResult('');
    setShowDiagnose(true);
  }

  async function submitDiagnosis() {
    if (!settings.deepseekApiKey) {
      alert("请先配置 DeepSeek API Key");
      setShowDiagnose(false);
      setShowSettings(true);
      return;
    }
    if (!diagnoseCode.trim()) {
      alert("请输入要诊断的代码");
      return;
    }
    setDiagnosing(true);
    setDiagnoseResult('');
    const res = await sendMessage({ type: 'DIAGNOSE_CODE', problem: diagnoseProblem, code: diagnoseCode });
    if (res?.diagnosis) {
      setDiagnoseResult(res.diagnosis);
    } else {
      setDiagnoseResult('诊断失败: ' + (res?.error || 'Unknown Error'));
    }
    setDiagnosing(false);
  }

  function renderHeatmap() {
    const today = new Date();
    const days = [];
    for(let i = 83; i >= 0; i--) { // 12 weeks
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const ds = `${yyyy}-${mm}-${dd}`;
      days.push({ date: ds, count: activityLog[ds] || 0 });
    }

    // Group by weeks (columns) for a GitHub-style layout: 7 rows x 12 cols
    const weeks = [];
    for (let i = 0; i < days.length; i += 7) {
      weeks.push(days.slice(i, i + 7));
    }

    return (
      <div style={{ marginTop: 24 }}>
        <h4 style={{ fontSize: 13, marginBottom: 8, color: 'var(--text-secondary)', textShadow: '1px 1px 0 #000' }}>⛏️ 活跃热力图 (最近12周)</h4>
        {activityLog.debugError && (
          <div style={{ fontSize: 11, color: '#ff5555', marginBottom: 8, background: 'rgba(255,0,0,0.1)', padding: 4, border: '1px solid #ff5555' }}>
            API Debug: {activityLog.debugError}
          </div>
        )}
        {activityLog.debugInfo && (
          <div style={{ fontSize: 11, color: '#55ff55', marginBottom: 8, background: 'rgba(0,255,0,0.1)', padding: 4, border: '1px solid #55ff55' }}>
            {activityLog.debugInfo}
          </div>
        )}
        <div style={{ display: 'flex', gap: 3 }}>
          {weeks.map((week, wi) => (
            <div key={wi} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {week.map(day => {
                let texture = 'url(/mc/stone.png)';
                let border = '2px solid #555';
                let shadow = 'inset -1px -1px rgba(0,0,0,0.5)';
                if (day.count >= 1 && day.count <= 2) {
                  texture = 'url(/mc/grass_block_top.png)';
                  border = '2px solid #2d6e12';
                  shadow = 'inset -2px -2px rgba(0,0,0,0.3), inset 2px 2px rgba(255,255,255,0.3)';
                } else if (day.count >= 3 && day.count <= 5) {
                  texture = 'url(/mc/gold_block.png)';
                  border = '2px solid #DDA520';
                  shadow = 'inset -2px -2px rgba(0,0,0,0.3), inset 2px 2px rgba(255,215,0,0.4)';
                } else if (day.count >= 6 && day.count <= 9) {
                  texture = 'url(/mc/emerald_block.png)';
                  border = '2px solid #00cc55';
                  shadow = 'inset -2px -2px rgba(0,0,0,0.3), inset 2px 2px rgba(100,255,100,0.5)';
                } else if (day.count >= 10) {
                  texture = 'url(/mc/diamond_block.png)';
                  border = '2px solid #00ccff';
                  shadow = 'inset -2px -2px rgba(0,0,0,0.3), inset 2px 2px rgba(100,200,255,0.6)';
                }
                return (
                  <div 
                    key={day.date} 
                    title={`${day.date}: 提交 ${day.count} 次`}
                    style={{ 
                      width: 18, height: 18,
                      backgroundImage: texture,
                      backgroundSize: 'cover',
                      imageRendering: 'pixelated',
                      border,
                      boxShadow: shadow,
                    }} 
                  />
                );
              })}
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 8, fontSize: 11, color: 'var(--text-secondary)', flexWrap: 'wrap' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><span style={{ width: 12, height: 12, display: 'inline-block', backgroundImage: 'url(/mc/stone.png)', backgroundSize: 'cover', imageRendering: 'pixelated', border: '1px solid #555' }} /> 0</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><span style={{ width: 12, height: 12, display: 'inline-block', backgroundImage: 'url(/mc/grass_block_top.png)', backgroundSize: 'cover', imageRendering: 'pixelated', border: '1px solid #2d6e12' }} /> 1-2</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><span style={{ width: 12, height: 12, display: 'inline-block', backgroundImage: 'url(/mc/gold_block.png)', backgroundSize: 'cover', imageRendering: 'pixelated', border: '1px solid #DDA520' }} /> 3-5</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><span style={{ width: 12, height: 12, display: 'inline-block', backgroundImage: 'url(/mc/emerald_block.png)', backgroundSize: 'cover', imageRendering: 'pixelated', border: '1px solid #00cc55' }} /> 6-9</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><span style={{ width: 12, height: 12, display: 'inline-block', backgroundImage: 'url(/mc/diamond_block.png)', backgroundSize: 'cover', imageRendering: 'pixelated', border: '1px solid #00ccff' }} /> 10+</span>
        </div>
      </div>
    );
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
            <span className="count">{todayReview.length} / 共 {stats?.dueToday || 0}</span>
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
                    <button className="btn btn-secondary btn-sm" style={{ background: 'var(--mc-cobble)' }} onClick={() => openDiagnose(item)}>
                      💻 诊断
                    </button>
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
              <div style={{ height: 6, background: '#000', border: '1px solid #333', overflow: 'hidden' }}>
                <div style={{ width: `${stats?.total > 0 ? (stats.mastered / stats.total * 100) : 0}%`, height: '100%', background: '#ffaa00' }} />
              </div>
            </div>
            {renderHeatmap()}
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

            <div className="form-group">
              <label className="form-label">每日最大复习数量 (防止堆积)</label>
              <input 
                type="number" 
                className="input-field" 
                min="1" max="200"
                value={settings.maxDailyReview || 20}
                onChange={e => setSettings({...settings, maxDailyReview: parseInt(e.target.value, 10)})}
              />
              <p className="form-hint">如果积压太多题目，系统会每天只放出这些题目供你复习。</p>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 32 }}>
              <button className="btn btn-secondary" onClick={() => setShowSettings(false)}>取消</button>
              <button className="btn btn-primary" onClick={saveSettings}>保存设置</button>
            </div>
          </div>
        </div>
      )}

      {/* Code Diagnose Modal */}
      {showDiagnose && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget && !diagnosing) setShowDiagnose(false); }}>
          <div className="modal-content" style={{ width: 700 }}>
            <div className="modal-header">
              <h2 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>💻 代码诊断</span>
                <span className="badge badge-medium" style={{ fontSize: 12 }}>#{diagnoseProblem?.id}</span>
              </h2>
              {!diagnosing && <button className="close-btn" onClick={() => setShowDiagnose(false)}>×</button>}
            </div>
            
            <div className="form-group" style={{ height: '100%' }}>
              <label className="form-label" style={{ color: '#fff' }}>粘贴你的代码进行复杂度评估：</label>
              <textarea 
                className="input-field" 
                style={{ height: 180, resize: 'vertical', fontFamily: 'monospace', fontSize: 13, background: '#1e1e1e', color: '#d4d4d4' }}
                placeholder="// 在此粘贴你的解答..."
                value={diagnoseCode}
                onChange={e => setDiagnoseCode(e.target.value)}
                disabled={diagnosing}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
              <button className="btn btn-primary" onClick={submitDiagnosis} disabled={diagnosing || !diagnoseCode.trim()}>
                {diagnosing ? '深度分析中...' : '提交诊断'}
              </button>
            </div>

            {diagnoseResult && (
              <div style={{ marginTop: 24, padding: 16, background: 'rgba(0,0,0,0.6)', border: '2px solid #55ff55', color: '#55ff55', fontSize: 13, whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                <strong>诊断报告：</strong><br/><br/>
                {diagnoseResult}
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
