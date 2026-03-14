document.documentElement.classList.add('site-loading');

window.__shouldUseMobileLayout = function () {
  const vw = window.innerWidth;
  const isTouchLike =
    (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) ||
    (window.matchMedia && window.matchMedia('(hover: none)').matches) ||
    ('ontouchstart' in window) ||
    (navigator.maxTouchPoints && navigator.maxTouchPoints > 0);
  return vw <= 768 || isTouchLike;
};

if (window.__shouldUseMobileLayout()) {
  document.documentElement.classList.add('mobile-mode');
}

window.addEventListener('DOMContentLoaded', () => {
  (function showChatDialogFirst() {
    var wrap = document.getElementById('chat-wrap');
    if (wrap) {
      wrap.style.visibility = 'visible';
      wrap.style.opacity = '1';
      wrap.style.zIndex = '9999';
    }
  })();

  (async function () {
    const root = document.documentElement;
    const body = document.body;
    const bgLayer = document.getElementById('bg-layer');
    const canvas = document.getElementById('character-canvas');
    const content = document.querySelector('.content');
    const iframe = document.querySelector('.uptime-iframe');
    const loadingOverlay = document.getElementById('loading');

    const shouldUseMobileLayout = window.__shouldUseMobileLayout;
    const setMobileMode = (enabled) => {
      root.classList.toggle('mobile-mode', enabled);
    };

    const delay = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));

    const waitForWindowLoad = () => {
      if (document.readyState === 'complete') {
        return Promise.resolve();
      }
      return new Promise((resolve) => {
        window.addEventListener('load', resolve, { once: true });
      });
    };

    const waitForIframeLoad = (node, timeoutMs) => {
      if (!node || node.dataset.loaded === 'true') {
        return Promise.resolve();
      }

      return new Promise((resolve) => {
        let settled = false;
        const done = () => {
          if (settled) return;
          settled = true;
          node.removeEventListener('load', onLoad);
          resolve();
        };
        const onLoad = () => {
          node.dataset.loaded = 'true';
          done();
        };

        node.addEventListener('load', onLoad, { once: true });
        window.setTimeout(done, timeoutMs);
      });
    };

    const extractBackgroundUrl = (node) => {
      if (!node) return '';
      const match = window.getComputedStyle(node).backgroundImage.match(/url\((['"]?)(.*?)\1\)/);
      return match ? match[2] : '';
    };

    const waitForImage = (url, timeoutMs) => {
      if (!url) {
        return Promise.resolve();
      }

      return new Promise((resolve) => {
        const img = new Image();
        let settled = false;
        const done = () => {
          if (settled) return;
          settled = true;
          resolve();
        };

        img.onload = done;
        img.onerror = done;
        window.setTimeout(done, timeoutMs);
        img.src = url;
      });
    };

    const revealSite = () => {
      if (root.classList.contains('site-ready')) {
        return;
      }

      root.classList.add('site-ready');
      root.classList.remove('site-loading');

      if (loadingOverlay) {
        loadingOverlay.classList.add('hidden');
      }
    };

    const initialIsMobile = shouldUseMobileLayout();
    setMobileMode(initialIsMobile);
    body.style.paddingRight = '';

    const readyTasks = [
      waitForWindowLoad(),
      waitForIframeLoad(iframe, 12000),
      waitForImage(extractBackgroundUrl(bgLayer), 12000),
    ];

    // 移动端仍然跳过 Live2D 模型加载，只等待页面本身资源完成。
    if (!initialIsMobile && window.PIXI && PIXI.live2d && PIXI.Application) {
      const app = new PIXI.Application({
        view: canvas,
        backgroundAlpha: 0,
        resizeTo: window,
        autoDensity: true,
        resolution: window.devicePixelRatio || 1,
      });

      /*
       * 同源优先；从 jsDelivr 打开时用 CDN（路径已改为 static/）。
       */
      const MODEL_BASE = (typeof location !== 'undefined' && location.origin && location.origin.includes('jsdelivr'))
        ? location.origin + '/gh/HiderX/Tsukuyomi@latest/static'
        : '';
      const MODEL_URL = MODEL_BASE
        ? `${MODEL_BASE}/yachiyo-kaguya/八千代辉夜姬.model3.json`
        : '/yachiyo-kaguya/八千代辉夜姬.model3.json';

      readyTasks.push(
        PIXI.live2d.Live2DModel.from(MODEL_URL).then((model) => {
          app.stage.addChild(model);
          window.__live2dModel = model;

          const origW = model.width;
          const origH = model.height;
          const charAspect = origW / origH;
          const IDEAL_MARGIN_RATIO = 0.2;

          function layout() {
            const vw = window.innerWidth;
            const vh = window.innerHeight;

            if (shouldUseMobileLayout()) {
              setMobileMode(true);
              body.style.paddingRight = '';
              return;
            }

            setMobileMode(false);
            body.style.paddingRight = '';

            const charH = vh * 0.95;
            const scale = charH / origH;
            model.scale.set(scale);
            const charW = charAspect * charH;
            const cardWidth = content.offsetWidth;
            const idealMargin = vw * IDEAL_MARGIN_RATIO;
            const maxMargin = (vw - charW - cardWidth) / 2;
            const margin = Math.max(0, Math.min(idealMargin, maxMargin));
            const cardH = content.offsetHeight || content.getBoundingClientRect().height || 1;
            const cardTooNarrow = cardWidth / cardH < 5 / 9;

            if (cardTooNarrow) {
              setMobileMode(true);
            } else {
              setMobileMode(false);
              body.style.paddingRight = `${margin}px`;
            }

            model.x = margin;
            model.y = 0;
            const cardRect = content.getBoundingClientRect();
            const canvasRect = canvas.getBoundingClientRect();
            const cardBottomInStage = cardRect.bottom - canvasRect.top;

            const b = model.getBounds(false);
            const modelBottom = b.y + b.height;
            // 按模型高度比例下移，随窗口变化仍对齐（getBounds 常不包含脚底）
            const bottomOffsetRatio = 0.155;
            model.y = cardBottomInStage - modelBottom + b.height * bottomOffsetRatio;
          }

          let introPlaying = false;
          const im = model.internalModel;
          const origEyeBlink = im.eyeBlink;

          document.addEventListener('pointermove', (e) => {
            const bounds = model.getBounds();
            const centerX = bounds.x + bounds.width / 2;
            const centerY = bounds.y + bounds.height / 2;
            const headX = centerX;
            const headY = bounds.y + bounds.height * 0.25;
            const dx = e.clientX - headX;
            const dy = e.clientY - headY;
            const offsetY = centerY - headY;
            const adjustedX = headX + dx;
            const adjustedY = headY + dy + offsetY;

            model.focus(adjustedX, adjustedY);
          });

          layout();
          window.addEventListener('resize', layout);
x
          async function playIntro() {
            if (introPlaying) return;
            introPlaying = true;
            im.eyeBlink = undefined;

            try {
              await model.motion('Intro', 0, 3);
            } catch (e) {
              console.error('Intro error:', e);
            } finally {
              im.eyeBlink = origEyeBlink;
              introPlaying = false;
            }
          }

          function onFirstInteraction() {
            playIntro();
            document.removeEventListener('click', onFirstInteraction);
            document.removeEventListener('touchstart', onFirstInteraction);
          }

          document.addEventListener('click', onFirstInteraction);
          document.addEventListener('touchstart', onFirstInteraction);
        }).catch((error) => {
          console.error('Live2D load error:', error);
        })
      );
    }

    await Promise.race([
      Promise.allSettled(readyTasks),
      delay(12000),
    ]);
    revealSite();

    // 对话窗口：消息列表 + 根据回复内容驱动 Live2D 动作（system prompt 与动作解析在后端）
    (async function initChat() {
      const wrap = document.getElementById('chat-wrap');
      const messagesEl = document.getElementById('chat-messages');
      const input = document.getElementById('chat-input');
      const sendBtn = document.getElementById('chat-send');
      if (!wrap || !messagesEl || !input || !sendBtn) return;

      wrap.style.visibility = 'visible';
      wrap.style.opacity = '1';
      wrap.style.zIndex = '9999';

      const toggleBtn = document.getElementById('chat-toggle');
      const unfoldBtn = document.getElementById('chat-unfold');
      if (toggleBtn) toggleBtn.addEventListener('click', () => wrap.classList.add('chat-wrap--hidden'));
      if (unfoldBtn) unfoldBtn.addEventListener('click', () => wrap.classList.remove('chat-wrap--hidden'));

      let DEBUG_ACTION = false;
      try {
        const res = await fetch('/api/config').catch(() => null);
        if (res && res.ok) {
          const config = await res.json().catch(() => ({}));
          DEBUG_ACTION = !!config.debug;
        }
      } catch (_) {}

      const chatHistory = [];
      const ACTION_REG = /^\s*ACTION:\s*(\w+)\s*$/i;

      // 头像等图片统一从 jsDelivr 拉取，同 URL 只请求一次、由浏览器缓存
      const IMG_CDN = 'https://cdn.jsdelivr.net/gh/HiderX/Tsukuyomi@latest/static';
      const AVATAR_USER = IMG_CDN + '/img/character_1thumb.png';
      const AVATAR_ASSISTANT = IMG_CDN + '/img/character_2thumb.png';

      function appendMessage(role, text) {
        const msg = document.createElement('div');
        msg.className = 'chat-msg ' + role;
        msg.setAttribute('data-role', role);
        const avatarWrap = document.createElement('div');
        avatarWrap.className = 'chat-msg-avatar-wrap';
        const avatar = document.createElement('img');
        avatar.className = 'chat-msg-avatar';
        avatar.src = role === 'user' ? AVATAR_USER : AVATAR_ASSISTANT;
        avatar.alt = role === 'user' ? '168' : 'ヤチヨ';
        avatarWrap.appendChild(avatar);
        const bubble = document.createElement('div');
        bubble.className = 'chat-msg-bubble';
        bubble.textContent = text;
        msg.appendChild(avatarWrap);
        msg.appendChild(bubble);
        messagesEl.appendChild(msg);
        messagesEl.scrollTop = messagesEl.scrollHeight;
      }

      function parseActionAndText(raw) {
        const lines = raw.split(/\r?\n/);
        let action = null;
        const textLines = [];
        for (let i = 0; i < lines.length; i++) {
          const m = lines[i].match(ACTION_REG);
          if (m) {
            action = m[1].toLowerCase();
            continue;
          }
          textLines.push(lines[i]);
        }
        const text = textLines.join('\n').trim();
        return { text, action };
      }

      const IDLE_RESTORE_DELAY_MS = 3500;
      const SMILE_DURATION_MS = 2000;
      const OTHER_ACTION_DURATION_MS = 2800;

      function runAction(actionOrList) {
        const model = window.__live2dModel;
        if (!model) {
          if (DEBUG_ACTION) console.warn('[Live2D runAction] 无 model，跳过');
          return;
        }
        const runIdle = () => {
          if (DEBUG_ACTION) console.log('[Live2D runIdle] 执行恢复待机');
          try {
            if (typeof model.motion === 'function') {
              model.motion('Idle', 0, 3);
              if (DEBUG_ACTION) console.log('[Live2D runIdle] 已调用 motion(Idle, 0, 3)');
            }
            resetExpression(model);
          } catch (e) {
            if (DEBUG_ACTION) console.error('[Live2D runIdle] 异常:', e);
          }
        };
        const list = Array.isArray(actionOrList) ? actionOrList : [actionOrList].filter(Boolean);
        if (list.length === 0) {
          runIdle();
          return;
        }
        if (list.length > 1 && list[0] !== 'idle') {
          console.log('[Live2D runAction] 顺序执行:', list.map((x) => (x || 'idle').toLowerCase()).join(' → '));
        }
        function runSingleAction(action, onDone) {
          const a = ((action || 'idle').toLowerCase().trim() === 'nod' ? 'greet' : (action || 'idle').toLowerCase().trim());
          if (a !== 'idle') {
            console.log('[Live2D runAction] 执行动作:', a, '| model:', !!model);
          }
          if (DEBUG_ACTION) {
            console.log('[Live2D runAction] 请求动作:', action, '| 归一:', a);
          }
          let durationMs = OTHER_ACTION_DURATION_MS;
          try {
            if (a === 'greet' && typeof model.motion === 'function') {
              if (DEBUG_ACTION) console.log('[Live2D runAction] 执行 greet → motion(Greet)');
              model.motion('Greet', 0, 2);
              durationMs = OTHER_ACTION_DURATION_MS;
            } else if (a === 'smile') {
              if (DEBUG_ACTION) console.log('[Live2D runAction] 执行 smile');
              try {
                if (typeof model.expression === 'function') model.expression('smile');
                const em = model.internalModel?.motionManager?.expressionManager ?? model.internalModel?.expressionManager;
                if (em && typeof em.setExpressionWeight === 'function') em.setExpressionWeight('smile', 1);
              } catch (e) {
                if (DEBUG_ACTION) console.warn('[Live2D runAction] smile 异常:', e);
              }
              durationMs = SMILE_DURATION_MS;
            } else if (a === 'sad' && typeof model.motion === 'function') {
              if (DEBUG_ACTION) console.log('[Live2D runAction] 执行 sad → motion(ReactError)');
              model.motion('ReactError', 0, 2);
              durationMs = OTHER_ACTION_DURATION_MS;
            } else if (a === 'shy' && typeof model.expression === 'function') {
              if (DEBUG_ACTION) console.log('[Live2D runAction] 执行 shy → expression(narrow_eyes)');
              model.expression('narrow_eyes');
              durationMs = OTHER_ACTION_DURATION_MS;
            } else if (a === 'cry' || a === 'tearful' || a === 'tears') {
              if (DEBUG_ACTION) console.log('[Live2D runAction] 执行 cry/tearful → motion(Cry)');
              try {
                if (typeof model.motion === 'function') {
                  model.motion('Cry', 0, 2);
                  if (DEBUG_ACTION) console.log('[Live2D runAction] motion(Cry) 已调用');
                }
              } catch (e) {
                if (DEBUG_ACTION) console.error('[Live2D runAction] motion(Cry) 失败:', e);
              }
              durationMs = 3600;
            } else if (a !== 'idle' && typeof model.motion === 'function') {
              if (DEBUG_ACTION) console.log('[Live2D runAction] 其他 → motion(Idle, 0, 2)');
              model.motion('Idle', 0, 2);
              durationMs = 0;
            }
          } catch (e) {
            if (DEBUG_ACTION) console.error('[Live2D runAction] 异常:', e);
          }
          if (typeof onDone === 'function') {
            window.setTimeout(onDone, durationMs);
          }
        }
        function runSequence(actions, index) {
          if (index >= actions.length) {
            runIdle();
            return;
          }
          runSingleAction(actions[index], () => runSequence(actions, index + 1));
        }
        if (list.length === 1) {
          runSingleAction(list[0], runIdle);
        } else {
          runSequence(list, 0);
        }
      }

      function resetExpression(model) {
        try {
          const em = model.internalModel?.expressionManager ?? model.internalModel?.motionManager?.expressionManager;
          if (DEBUG_ACTION) console.log('[Live2D resetExpression] expressionManager:', !!em, 'resetExpression:', typeof em?.resetExpression, 'stopAllExpressions:', typeof em?.stopAllExpressions, 'setExpressionWeight:', typeof em?.setExpressionWeight);
          if (em && typeof em.stopAllExpressions === 'function') {
            em.stopAllExpressions();
            if (DEBUG_ACTION) console.log('[Live2D resetExpression] 已调用 stopAllExpressions()');
            return;
          }
          if (em && typeof em.resetExpression === 'function') {
            em.resetExpression();
            if (DEBUG_ACTION) console.log('[Live2D resetExpression] 已调用 resetExpression()');
            return;
          }
          if (em && typeof em.setExpressionWeight === 'function') {
            ['smile', 'narrow_eyes', 'tear_drop', 'tears'].forEach((name) => {
              try { em.setExpressionWeight(name, 0); } catch (_) {}
            });
            if (DEBUG_ACTION) console.log('[Live2D resetExpression] 已将所有表情权重设为 0');
          } else if (em && em._expressionWeights) {
            Object.keys(em._expressionWeights || {}).forEach((name) => {
              try { em.setExpressionWeight(name, 0); } catch (_) {}
            });
            if (DEBUG_ACTION) console.log('[Live2D resetExpression] 已通过 _expressionWeights 清零');
          }
        } catch (e) {
          if (DEBUG_ACTION) console.warn('[Live2D resetExpression] 异常:', e);
        }
      }

      function getChatEndpoint() {
        return '/v1/chat/completions';
      }

      async function sendToAI(userText) {
        const endpoint = getChatEndpoint();
        const headers = { 'Content-Type': 'application/json' };

        const messages = [];
        chatHistory.forEach((m) => messages.push({ role: m.role, content: m.content }));
        messages.push({ role: 'user', content: userText });

        const body = { model: 'gpt-4o-mini', messages };

        const requestUrl = (typeof location !== 'undefined' && location.origin) ? (location.origin + endpoint) : endpoint;
        const res = await fetch(endpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
        }).catch((e) => {
          appendMessage('assistant', '【环节：浏览器→本后端】请求未发出或网络异常：' + (e.message || '网络错误') + '。请求地址：' + requestUrl);
          return null;
        });
        if (!res || !res.ok) {
          let errMsg = '';
          let errBody = {};
          try {
            errBody = await res.json().catch(() => ({}));
          } catch (_) {}
          const stage = errBody.stage;
          const detail = errBody.detail || errBody.error || errBody.message || '';
          const upstreamUrl = errBody.upstream_url;
          const upstreamStatus = errBody.upstream_status;
          if (res.status === 501) {
            errMsg = '【环节：当前服务器】' + res.status + ' 接口未实现。说明：请求已到达「' + requestUrl + '」，但该地址对应的服务未提供 /v1/chat/completions（例如静态托管、其它 Web 服务）。请用 ./start.sh 启动的本后端地址打开本页（如 http://localhost:5001）。';
          } else if (stage === 'backend') {
            errMsg = '【环节：本后端配置】' + res.status + ' ' + (errBody.error || '') + '。' + (detail ? '详情：' + detail : '');
          } else if (stage === 'upstream') {
            errMsg = '【环节：本后端→上游 API】上游返回 ' + (upstreamStatus || res.status) + '。上游地址：' + (upstreamUrl || '') + '。详情：' + (detail || '');
          } else {
            errMsg = '【环节：本后端】请求「' + requestUrl + '」返回 ' + res.status + (res.statusText ? ' ' + res.statusText : '') + (detail ? '。' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : '');
          }
          appendMessage('assistant', errMsg);
          return null;
        }

        const data = await res.json().catch(() => ({}));
        if (!data || !res.ok) return null;
        return data;
      }

      sendBtn.addEventListener('click', async () => {
        const text = (input.value || '').trim();
        if (!text) return;
        input.value = '';
        sendBtn.disabled = true;

        appendMessage('user', text);
        chatHistory.push({ role: 'user', content: text });

        const placeholder = document.createElement('div');
        placeholder.className = 'chat-msg assistant';
        placeholder.setAttribute('data-role', 'assistant');
        placeholder.innerHTML =
          '<div class="chat-msg-avatar-wrap"><img class="chat-msg-avatar" src="' + AVATAR_ASSISTANT + '" alt="ヤチヨ" /></div><div class="chat-msg-bubble">…</div>';
        messagesEl.appendChild(placeholder);
        messagesEl.scrollTop = messagesEl.scrollHeight;

        const data = await sendToAI(text);
        sendBtn.disabled = false;

        placeholder.remove();
        if (!data) return;

        let displayText = data?.choices?.[0]?.message?.content;
        if (typeof displayText !== 'string') displayText = '';
        let finalAction = data?.live2d_action;
        if (finalAction == null) {
          const parsed = parseActionAndText(displayText);
          displayText = parsed.text;
          finalAction = parsed.action || 'idle';
        }
        if (DEBUG_ACTION) console.log('[Chat] 展示文案:', displayText.slice(0, 80), '| 动作(来自后端或解析):', finalAction);
        appendMessage('assistant', displayText || '…');
        chatHistory.push({ role: 'assistant', content: displayText });
        runAction(finalAction);
      });

      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          sendBtn.click();
        }
      });
    })();
  })();
});
