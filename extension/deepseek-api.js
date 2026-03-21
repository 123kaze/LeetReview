/**
 * DeepSeek API 集成模块
 */

const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions';

/**
 * 调用 DeepSeek Chat API
 * @param {string} apiKey
 * @param {Array} messages - [{role, content}, ...]
 * @param {Object} options
 * @returns {Promise<string>} 回复内容
 */
export async function chatWithDeepSeek(apiKey, messages, options = {}) {
  const { model = 'deepseek-chat', temperature = 0.7, maxTokens = 1024 } = options;

  const resp = await fetch(DEEPSEEK_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
      stream: false
    })
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`DeepSeek API error ${resp.status}: ${err}`);
  }

  const data = await resp.json();
  return data.choices?.[0]?.message?.content || '';
}

/**
 * 生成每日学情总结
 */
export async function generateDailySummary(apiKey, stats, todayReview, todayNew) {
  const reviewTitles = todayReview.slice(0, 10).map(p => `${p.id}. ${p.title} (${p.difficulty})`).join('\n');
  const newTitles = todayNew.slice(0, 5).map(p => `${p.id}. ${p.title} (${p.difficulty})`).join('\n');

  const prompt = `你是一位专业的算法学习导师。请根据以下信息为用户生成一份简短、鼓励性的今日学习计划摘要（中文，200字以内）。

## 用户统计
- 总做题数：${stats.total}
- 今日待复习：${stats.dueToday} 道
- 已掌握（退休）：${stats.retired} 道

## 今日复习题单（最多显示10题）
${reviewTitles || '（无需复习，太棒了！）'}

## 今日推荐新学
${newTitles || '（暂无新题推荐）'}

请给出一句激励语 + 简要的今日学习建议，不要太啰嗦。`;

  return chatWithDeepSeek(apiKey, [
    { role: 'system', content: '你是一位友好的算法教练，擅长鼓励和引导学生科学刷题。' },
    { role: 'user', content: prompt }
  ]);
}

/**
 * 生成复习时的智能提示（不直接给答案）
 */
export async function generateHint(apiKey, problem, hintLevel = 1) {
  const levelDesc = {
    1: '给出一个简单的方向性提示，不要透露具体算法',
    2: '给出关键算法思路和数据结构选择的提示',
    3: '给出详细的解题步骤框架，但不写具体代码'
  };

  const prompt = `题目：${problem.id}. ${problem.title}
难度：${problem.difficulty}
知识标签：${(problem.topicTags || []).map(t => t.nameTranslated || t.name).join(', ')}

请按以下要求给出提示（级别 ${hintLevel}）：
${levelDesc[hintLevel] || levelDesc[1]}

注意：你是在帮助学生通过启发式学习来回忆解法，不要直接给出完整代码。用中文回答。`;

  return chatWithDeepSeek(apiKey, [
    { role: 'system', content: '你是一位 LeetCode 算法辅导老师，擅长用启发式提问帮助学生自己想出解法。' },
    { role: 'user', content: prompt }
  ], { temperature: 0.6, maxTokens: 512 });
}
