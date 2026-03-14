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
       * 备选：使用 R2（https://cdn.qkv.io）时，只需要把 BASE 替换掉即可。
       * 当前保持和页面图片一致，统一走 jsDelivr。
       */
      const JSDELIVR_BASE = 'https://cdn.jsdelivr.net/gh/HiderX/Tsukuyomi@latest';

      readyTasks.push(
        PIXI.live2d.Live2DModel.from(
          `${JSDELIVR_BASE}/live2d/yachiyo-kaguya/八千代辉夜姬.model3.json`
        ).then((model) => {
          app.stage.addChild(model);

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
  })();
});
