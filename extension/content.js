/**
 * Content Script - 注入到 LeetCode 刷题页面
 * 1. 监听用户提交结果，检测 Accepted 并通知 Background
 * 2. 代理 GraphQL API 请求（因为 content script 可以使用页面的 cookie）
 */

(function () {
  'use strict';

  console.log('[LeetReview] Content script loaded on:', window.location.href);

  // 从 URL 提取题目 slug
  function getTitleSlug() {
    const match = window.location.pathname.match(/\/problems\/([^/]+)/);
    return match ? match[1] : null;
  }

  // ─── 监听来自 background 的消息（代理 API 请求） ───
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'PROXY_GRAPHQL') {
      proxyGraphQL(msg.query, msg.variables)
        .then(sendResponse)
        .catch(err => sendResponse({ error: err.message }));
      return true; // keep channel open
    }
  });

  /**
   * 代理 GraphQL 请求 —— 在页面上下文中发起，自动携带 cookie
   */
  async function proxyGraphQL(query, variables) {
    const resp = await fetch('https://leetcode.cn/graphql/', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables })
    });
    if (!resp.ok) throw new Error(`LeetCode API error: ${resp.status}`);
    return resp.json();
  }

  // ─── 拦截 XHR 以检测提交结果 ───
  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this._leetreview_url = url;
    this._leetreview_method = method;
    return originalOpen.call(this, method, url, ...rest);
  };

  XMLHttpRequest.prototype.send = function (body) {
    const url = this._leetreview_url || '';

    if (url.includes('/graphql') && body) {
      try {
        const parsed = JSON.parse(body);
        if (parsed.query && parsed.query.includes('submissionDetails')) {
          this.addEventListener('load', function () {
            try {
              const resp = JSON.parse(this.responseText);
              const detail = resp?.data?.submissionDetails;
              if (detail && detail.statusDisplay === 'Accepted') {
                onAccepted(detail);
              }
            } catch (e) { /* ignore */ }
          });
        }
      } catch (e) { /* not JSON */ }
    }

    return originalSend.call(this, body);
  };

  // 同时监听 fetch 请求
  const originalFetch = window.fetch;
  window.fetch = async function (...args) {
    const resp = await originalFetch.apply(this, args);

    const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';
    if (url.includes('/graphql')) {
      try {
        const cloned = resp.clone();
        const data = await cloned.json();
        const detail = data?.data?.submissionDetails;
        if (detail && detail.statusDisplay === 'Accepted') {
          onAccepted(detail);
        }
      } catch (e) { /* ignore */ }
    }

    return resp;
  };

  // 也监听 DOM 变化
  let lastChecked = '';
  const observer = new MutationObserver(() => {
    const successElements = document.querySelectorAll('[data-e2e-locator="submission-result"]');
    for (const el of successElements) {
      const text = el.textContent.trim();
      if ((text.includes('通过') || text.includes('Accepted')) && text !== lastChecked) {
        lastChecked = text;
        onAcceptedFromDOM();
        break;
      }
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });

  function onAccepted(detail) {
    const titleSlug = getTitleSlug();
    if (!titleSlug) return;

    console.log('[LeetReview] ✅ Accepted detected for:', titleSlug);
    chrome.runtime.sendMessage({
      type: 'ADD_PROBLEM',
      problem: {
        titleSlug,
        title: document.title.replace(/ - .*$/, '').trim(),
        id: titleSlug,
        difficulty: '',
        topicTags: []
      }
    }, (resp) => {
      if (resp?.isNew) showToast('🎉 题目已加入复习计划！');
    });
  }

  function onAcceptedFromDOM() {
    const titleSlug = getTitleSlug();
    if (!titleSlug) return;

    console.log('[LeetReview] ✅ Accepted detected (DOM) for:', titleSlug);
    chrome.runtime.sendMessage({
      type: 'ADD_PROBLEM',
      problem: {
        titleSlug,
        title: document.title.replace(/ - .*$/, '').trim(),
        id: titleSlug,
        difficulty: '',
        topicTags: []
      }
    }, (resp) => {
      if (resp?.isNew) showToast('🎉 题目已加入复习计划！');
    });
  }

  function showToast(message) {
    const toast = document.createElement('div');
    toast.textContent = message;
    Object.assign(toast.style, {
      position: 'fixed',
      top: '20px',
      right: '20px',
      zIndex: '99999',
      padding: '12px 24px',
      borderRadius: '8px',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      color: '#fff',
      fontSize: '14px',
      fontWeight: '600',
      boxShadow: '0 4px 20px rgba(102, 126, 234, 0.4)',
      transition: 'all 0.4s ease',
      opacity: '0',
      transform: 'translateY(-10px)'
    });

    document.body.appendChild(toast);
    requestAnimationFrame(() => {
      toast.style.opacity = '1';
      toast.style.transform = 'translateY(0)';
    });

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(-10px)';
      setTimeout(() => toast.remove(), 400);
    }, 3000);
  }
})();
