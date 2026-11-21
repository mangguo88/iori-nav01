(function () {
  const Home = window.IoriHome = window.IoriHome || {};

  Home.createCardController = function () {
    const initialCards = document.querySelectorAll('.site-card.card-anim-enter');
    const sitesGrid = document.getElementById('sitesGrid');
    const defaultCardConfig = {
      hideDesc: false,
      hideLinks: false,
      hideCategory: false,
      hideCopyText: false,
      enableFrostedGlass: false,
      cardStyle: 'style1',
      cardAnimation: 'radial',
      gridCols: '4',
      aboveFoldImageCount: 8,
      baseCardClass: 'site-card group h-full flex flex-col bg-white border border-primary-100/60 shadow-sm overflow-hidden dark:bg-gray-800 dark:border-gray-700',
      frostedClass: '',
      cardStyleClass: '',
      titleClass: 'site-title text-base font-medium text-gray-900 dark:text-gray-100 truncate transition-all duration-300 origin-left',
      descClass: 'mt-2 text-sm text-gray-600 dark:text-gray-400 leading-relaxed line-clamp-2',
      categoryClass: 'site-category inline-flex items-center px-2 py-0.5 mt-1 rounded-full text-xs font-medium bg-secondary-100 text-primary-700 dark:bg-secondary-800 dark:text-primary-300',
      linkRowClass: 'mt-3 flex items-center justify-between',
      urlTextClass: 'text-xs text-primary-600 dark:text-primary-400 truncate flex-1 min-w-0 mr-2',
      copyButtonBaseClass: 'copy-btn relative flex items-center px-2 py-1 rounded-full text-xs font-medium transition-colors',
      copyButtonEnabledClass: 'bg-accent-100 text-accent-700 hover:bg-accent-200 dark:bg-accent-900/30 dark:text-accent-300 dark:hover:bg-accent-900/50',
      copyButtonDisabledClass: 'bg-gray-200 text-gray-400 cursor-not-allowed dark:bg-gray-700 dark:text-gray-500',
      logoClass: 'w-10 h-10 rounded-lg object-cover bg-gray-100 dark:bg-gray-700',
      siteIconClass: 'site-icon flex-shrink-0 mr-4 transition-all duration-300',
    };
    const cardConfigSets = window.IORI_CARD_CONFIGS || {};
    const cardAnimationTypes = ['slideUp', 'radial', 'fadeIn', 'slideLeft', 'slideRight', 'convergeIn', 'flipIn'];
    const cardAnimationClasses = cardAnimationTypes.map(type => `card-anim-${type}`);
    const reducedMotionQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const mobileCardQuery = window.matchMedia?.('(max-width: 767px)');
    let activeCardDevice = '';
    let cardConfig = getActiveCardConfig();
    let activeRenderedCatalogId = window.IORI_LAYOUT_CONFIG?.ssrCatalogId && window.IORI_LAYOUT_CONFIG.ssrCatalogId !== 'all'
      ? String(window.IORI_LAYOUT_CONFIG.ssrCatalogId)
      : null;

    function getCardDevice() {
      return mobileCardQuery?.matches ? 'mobile' : 'desktop';
    }

    function getActiveCardConfig() {
      const device = getCardDevice();
      activeCardDevice = device;
      return cardConfigSets[device] || cardConfigSets.desktop || defaultCardConfig;
    }

    function getSitesForCatalog(catalogId) {
      const allSites = window.IORI_SITES || [];
      if (!catalogId) return allSites;
      return allSites.filter(site => String(site.catelog_id) === String(catalogId));
    }

    // ---- CSRF token（所有写操作用）----
    // 首页 HTML 是 KV 共享缓存，不能把 token 注入进去；先读页面 meta（首页没有），
    // 再调 GET /api/csrf-token 现取（仅管理员能调，未登录 401），拿到后缓存起来。
    let cachedCsrfToken = null;
    async function getCsrfToken() {
      if (cachedCsrfToken) return cachedCsrfToken;
      const meta = document.querySelector('meta[name="csrf-token"]');
      const metaToken = meta && meta.getAttribute('content');
      if (metaToken) { cachedCsrfToken = metaToken; return cachedCsrfToken; }
      try {
        const res = await fetch('/api/csrf-token', { credentials: 'same-origin' });
        if (!res.ok) return null;
        const data = await res.json();
        if (data && data.csrfToken) { cachedCsrfToken = data.csrfToken; return cachedCsrfToken; }
      } catch (e) { /* 拿不到就返回 null，由调用方提示登录 */ }
      return null;
    }

    // 所有写操作统一走这里：自动带 X-CSRF-Token；拿不到 token 或服务端报 401
    // 就抛 NEED_LOGIN，调用方提示“请先去 /admin 登录”。
    async function apiFetch(url, options = {}) {
      const token = await getCsrfToken();
      if (!token) {
        const err = new Error('NEED_LOGIN');
        err.code = 'NEED_LOGIN';
        throw err;
      }
      const headers = Object.assign({}, options.headers || {}, { 'X-CSRF-Token': token });
      const res = await fetch(url, Object.assign({}, options, { headers, credentials: 'same-origin' }));
      if (res.status === 401) {
        cachedCsrfToken = null;
        const err = new Error('NEED_LOGIN');
        err.code = 'NEED_LOGIN';
        throw err;
      }
      return res;
    }

    function isNeedLoginError(e) {
      return Boolean(e && (e.code === 'NEED_LOGIN' || e.message === 'NEED_LOGIN'));
    }

    function applyCardGridColumns() {
      if (!sitesGrid || getCardDevice() !== 'mobile') return;
      const cols = String(cardConfig.gridCols || '2');
      const mobileGridClass = cols === '1' ? 'grid-cols-1' : (cols === '3' ? 'grid-cols-3' : 'grid-cols-2');
      const mobileCardStyleClass = cardConfig.cardStyle === 'style3'
        ? 'mobile-card-style3'
        : (cardConfig.cardStyle === 'style2' ? 'mobile-card-style2' : 'mobile-card-style1');
      sitesGrid.classList.remove('grid-cols-1', 'grid-cols-2', 'grid-cols-3');
      sitesGrid.classList.remove('mobile-card-style1', 'mobile-card-style2', 'mobile-card-style3');
      sitesGrid.classList.add(mobileGridClass);
      sitesGrid.classList.add(mobileCardStyleClass);
    }

    function syncCardConfigForViewport(options = {}) {
      const device = getCardDevice();
      const nextConfig = cardConfigSets[device] || cardConfigSets.desktop || defaultCardConfig;
      if (!options.force && device === activeCardDevice && nextConfig === cardConfig) return;

      activeCardDevice = device;
      cardConfig = nextConfig;
      applyCardGridColumns();
      renderSites(getSitesForCatalog(activeRenderedCatalogId));
      Home.reapplyLocalSearchFilter?.();
    }

    function prefersReducedCardMotion() {
      return reducedMotionQuery?.matches === true;
    }

    function resolveCardAnimationName() {
      const configured = cardConfig.cardAnimation || window.IORI_LAYOUT_CONFIG?.cardAnimation || 'radial';
      if (configured === 'random') {
        return cardAnimationTypes[Math.floor(Math.random() * cardAnimationTypes.length)];
      }
      return cardAnimationTypes.includes(configured) ? configured : 'radial';
    }

    // 读 gridTemplateColumns 会强制同步样式解析。此前每张卡要读 2 次
    // （prepareCardAnimation 与 getCardAnimationDelay 各一次），而循环里每张卡都在改
    // class/style，于是 N 张卡触发 2N 次强制样式重算（1000 张卡实测 2000 次）。
    // 列数在一次批量渲染内不变，缓存后每批只读 1 次。
    let cachedAnimationCols = 0;

    function invalidateAnimationColumnCount() {
      cachedAnimationCols = 0;
    }

    function getAnimationColumnCount() {
      if (!cachedAnimationCols) {
        cachedAnimationCols = computeAnimationColumnCount();
      }
      return cachedAnimationCols;
    }

    function computeAnimationColumnCount() {
      const templateColumns = sitesGrid ? window.getComputedStyle(sitesGrid).gridTemplateColumns : '';
      if (templateColumns && templateColumns !== 'none') {
        const renderedCols = templateColumns.trim().split(/\s+/).filter(Boolean).length;
        if (renderedCols > 0) return renderedCols;
      }

      const configuredCols = String(cardConfig.gridCols || window.IORI_LAYOUT_CONFIG?.gridCols || (getCardDevice() === 'mobile' ? '2' : '4'));
      const width = window.innerWidth;
      if (width < 768) {
        const mobileCols = Number(configuredCols);
        return Number.isFinite(mobileCols) && mobileCols > 0 ? mobileCols : 2;
      }
      if (width < 1024) return 3;

      if (getCardDevice() === 'mobile') {
        const mobileCols = Number(configuredCols);
        return Number.isFinite(mobileCols) && mobileCols > 0 ? mobileCols : 2;
      }
      if (configuredCols === '6') return width >= 1200 ? 6 : 5;
      if (configuredCols === '7') return width >= 1280 ? 7 : 5;

      const cols = Number(configuredCols);
      return Number.isFinite(cols) && cols > 0 ? cols : 4;
    }

    function getCardAnimationDelay(index, animationType) {
      const cols = getAnimationColumnCount();
      const row = Math.floor(index / cols);
      const col = index % cols;
      const centerCol = (cols - 1) / 2;
      let delay = 0;

      if (animationType === 'radial') {
        delay = (Math.abs(col - centerCol) + row) * 80;
      } else if (animationType === 'fadeIn') {
        delay = Math.random() * 500;
      } else if (animationType === 'slideLeft') {
        delay = row * 100;
      } else if (animationType === 'slideRight') {
        delay = (row + (cols - col - 1) * 0.02) * 80;
      } else if (animationType === 'convergeIn') {
        const maxDistance = Math.max(centerCol, cols - centerCol - 1);
        delay = (maxDistance - Math.abs(col - centerCol)) * 80;
      } else if (animationType === 'flipIn') {
        delay = (row + col) * 60;
      } else {
        delay = index * 50;
      }

      return Math.min(delay, 1000);
    }

    function prepareCardAnimation(card, index, animationType) {
      const cols = getAnimationColumnCount();
      const col = index % cols;
      const centerCol = (cols - 1) / 2;

      cardAnimationClasses.forEach(className => card.classList.remove(className));
      card.classList.remove('card-anim-flip-settle', 'card-anim-flip-settle-fade');
      card.style.removeProperty('--card-anim-x');
      card.style.removeProperty('--card-anim-y');

      if (animationType === 'convergeIn') {
        const offset = col - centerCol;
        const distance = Math.abs(offset);
        const isCenter = distance <= 0.5;
        const x = isCenter ? 0 : Math.sign(offset) * Math.min(80, 28 + distance * 22);
        const y = isCenter ? -30 : 0;
        card.style.setProperty('--card-anim-x', `${x}px`);
        card.style.setProperty('--card-anim-y', `${y}px`);
      }

      card.classList.add(`card-anim-${animationType}`);

      const delay = getCardAnimationDelay(index, animationType);
      if (delay > 0) {
        card.style.animationDelay = `${delay}ms`;
      } else {
        card.style.removeProperty('animation-delay');
      }
    }

    function cleanupCardAnimation(card) {
      const wasFlipIn = card.classList.contains('card-anim-flipIn');
      card.classList.add('card-anim-cleanup');
      if (wasFlipIn) {
        card.classList.add('card-anim-flip-settle');
      }
      card.classList.remove('card-anim-enter');
      cardAnimationClasses.forEach(className => card.classList.remove(className));
      card.style.removeProperty('--card-anim-x');
      card.style.removeProperty('--card-anim-y');
      card.style.removeProperty('animation-delay');
      window.requestAnimationFrame(() => {
        card.classList.remove('card-anim-cleanup');
        if (!wasFlipIn) return;
        card.classList.add('card-anim-flip-settle-fade');
        window.setTimeout(() => {
          card.classList.remove('card-anim-flip-settle', 'card-anim-flip-settle-fade');
        }, 160);
      });
    }

    function bindCardAnimationCleanup(card) {
      if (prefersReducedCardMotion()) {
        cleanupCardAnimation(card);
        return;
      }

      let isCleaned = false;
      let fallbackTimer = null;

      const cleanup = () => {
        if (isCleaned) return;
        isCleaned = true;
        cleanupCardAnimation(card);
        card.removeEventListener('animationend', handleAnimationEnd);
        if (fallbackTimer) window.clearTimeout(fallbackTimer);
      };

      const handleAnimationEnd = (event) => {
        if (event.target !== card) return;
        cleanup();
      };

      const delayMs = Number.parseFloat(card.style.animationDelay) || 0;
      fallbackTimer = window.setTimeout(cleanup, delayMs + 900);
      card.addEventListener('animationend', handleAnimationEnd);
    }

    function animateCardBatch(cards) {
      const animationType = resolveCardAnimationName();
      cards.forEach((card, index) => prepareCardAnimation(card, index, animationType));
    }

    function renderSites(sites) {
      if (!sitesGrid) return;

      // 重渲染时收起风格三悬停面板，面板是 body 级浮层，不会随网格一起消失
      hideStyle3HoverPanel();

      // 网格列数可能随设备/布局切换而变化，每批渲染前失效一次
      invalidateAnimationColumnCount();
      applyCardGridColumns();
      Home.clearSearchCardCache?.();

      sitesGrid.innerHTML = '';

      if (sites.length === 0) {
        sitesGrid.innerHTML = '<div class="col-span-full text-center text-gray-500 py-10">本分类下暂无书签</div>';
        return;
      }

      const animationType = resolveCardAnimationName();

      sites.forEach((site, index) => {
        const isAboveFold = index < (cardConfig.aboveFoldImageCount || 8);
        const imgLoadingAttrs = isAboveFold ? 'fetchpriority="high" decoding="async"' : 'loading="lazy" decoding="async"';
        const logoHtml = (site.logoUrlHtml
          ? `<img src="${site.logoUrlHtml}" alt="${site.nameHtml}" width="40" height="40" class="${cardConfig.logoClass}" ${imgLoadingAttrs} draggable="false" onerror="this.style.display='none';var f=this.parentElement.querySelector('.site-logo-fallback');if(f){f.style.display='flex';}">`
          : '')
          + `<div class="site-logo-fallback w-10 h-10 rounded-lg bg-primary-600 flex items-center justify-center text-white font-semibold text-lg shadow-inner" style="${site.logoUrlHtml ? 'display:none;' : ''}">${site.cardInitialHtml}</div>`;

        const descHtml = cardConfig.hideDesc ? '' : `<p class="${cardConfig.descClass} site-desc cursor-pointer hover:text-primary-600 dark:hover:text-primary-300" data-site-id="${site.id}" title="点击编辑描述">${site.descHtml}</p>`;

        const linksHtml = cardConfig.hideLinks ? '' : `
          <div class="${cardConfig.linkRowClass}">
            <span class="${cardConfig.urlTextClass}" title="${site.displayUrlHtml}">${site.displayUrlHtml}</span>
            <button class="${cardConfig.copyButtonBaseClass} ${site.hasValidUrl ? cardConfig.copyButtonEnabledClass : cardConfig.copyButtonDisabledClass}" data-url="${site.urlHtml}" ${site.hasValidUrl ? '' : 'disabled'}>
              <svg class="h-3 w-3 ${cardConfig.hideCopyText ? '' : 'mr-1'}"><use href="#icon-copy"/></svg>
              ${cardConfig.hideCopyText ? '' : '<span class="copy-text">复制</span>'}
              <span class="copy-success hidden absolute -top-8 right-0 bg-accent-500 text-white text-xs px-2 py-1 rounded shadow-md">已复制!</span>
            </button>
          </div>`;

        const categoryHtml = cardConfig.hideCategory ? '' : `
                <span class="${cardConfig.categoryClass}">
                  ${site.catalogHtml}
                </span>`;

        const card = document.createElement('div');
        card.className = `${cardConfig.baseCardClass} ${cardConfig.frostedClass} ${cardConfig.cardStyleClass} card-anim-enter`;
        prepareCardAnimation(card, index, animationType);
        bindCardAnimationCleanup(card);

        card.setAttribute('data-id', site.id);
        // 桌面端允许拖动排序；移动端 HTML5 DnD 不支持触摸，不开启（长按走右键菜单）
        card.draggable = getCardDevice() === 'desktop';

        card.innerHTML = `
        <div class="site-card-content">
          <a href="${site.urlHtml || '#'}" ${site.hasValidUrl ? 'target="_blank" rel="noopener noreferrer"' : ''} class="block" draggable="false">
            <div class="flex items-start">
              <div class="${cardConfig.siteIconClass}">
                ${logoHtml}
              </div>
              <div class="flex-1 min-w-0">
                <h3 class="${cardConfig.titleClass}" title="${site.nameHtml}">${site.nameHtml}</h3>
                ${categoryHtml}
              </div>
            </div>
            ${descHtml}
          </a>
          ${linksHtml}
        </div>
        `;

        sitesGrid.appendChild(card);
      });
    }

    // ---- 点击描述栏，在当前窗口弹编辑弹窗 ----
    // 描述在 <a> 链接里面，点它默认会跳去目标站，所以用捕获阶段拦截：
    // 点到 .site-desc 就阻止跳转、打开弹窗；点卡片其它地方照常打开网站。
    let descEditModal = null;
    let descEditingSite = null;

    function decodeHtmlEntities(text) {
      const t = document.createElement('textarea');
      t.innerHTML = text || '';
      return t.value;
    }

    function escapeHtml(text) {
      return String(text ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    function ensureDescEditModal() {
      if (descEditModal) return descEditModal;
      const modal = document.createElement('div');
      modal.id = 'descEditModal';
      modal.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 opacity-0 invisible transition-all duration-300';
      modal.innerHTML = `
        <div class="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-md mx-4 transform translate-y-8 transition-all duration-300">
          <div class="p-6">
            <div class="flex items-center justify-between mb-4">
              <h2 class="text-xl font-semibold text-gray-900 dark:text-gray-100">编辑描述</h2>
              <button type="button" data-desc-edit-close class="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300">
                <svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <p class="text-sm text-gray-500 dark:text-gray-400 mb-3">正在编辑：<span id="descEditSiteName" class="font-medium text-gray-800 dark:text-gray-200"></span></p>
            <textarea id="descEditText" rows="4" maxlength="1000" placeholder="写一句描述 / 备注，留空就是“暂无描述”" class="block w-full px-3 py-2 border border-primary-100 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-200 focus:border-primary-400 dark:bg-gray-700 dark:text-gray-100"></textarea>
            <p class="text-xs text-gray-400 mt-2">保存后立即在当前页生效。需要管理员登录：没登录会提示你先去 /admin 登录。</p>
            <div id="descEditMessage" class="hidden rounded-lg border px-3 py-2 text-sm leading-relaxed mt-3"></div>
            <div class="flex justify-end pt-4">
              <button type="button" data-desc-edit-close class="bg-white dark:bg-gray-700 py-2 px-4 border border-primary-100 dark:border-gray-600 rounded-md shadow-sm text-sm font-medium text-primary-600 dark:text-primary-300 hover:bg-secondary-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-200 mr-3">取消</button>
              <button type="button" id="descEditSaveBtn" class="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-accent-500 hover:bg-accent-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent-400">保存</button>
            </div>
          </div>
        </div>`;
      document.body.appendChild(modal);
      modal.addEventListener('click', (e) => {
        if (e.target === modal || (e.target.closest && e.target.closest('[data-desc-edit-close]'))) closeDescEditModal();
      });
      modal.querySelector('#descEditSaveBtn').addEventListener('click', saveDescEdit);
      descEditModal = modal;
      return modal;
    }

    function showDescEditMessage(text, isError) {
      const el = descEditModal && descEditModal.querySelector('#descEditMessage');
      if (!el) return;
      el.classList.remove('hidden');
      el.textContent = text;
      el.className = 'rounded-lg border px-3 py-2 text-sm leading-relaxed mt-3 ' + (isError
        ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-900/30 dark:text-red-300'
        : 'border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-900/30 dark:text-green-300');
    }

    function openDescEditModal(siteId) {
      const site = (window.IORI_SITES || []).find((s) => String(s.id) === String(siteId));
      if (!site) return;
      descEditingSite = site;
      const modal = ensureDescEditModal();
      modal.querySelector('#descEditSiteName').textContent = decodeHtmlEntities(site.nameHtml);
      const rawDesc = decodeHtmlEntities(site.descHtml);
      modal.querySelector('#descEditText').value = (site.hasDesc && rawDesc !== '暂无描述') ? rawDesc : '';
      const msg = modal.querySelector('#descEditMessage');
      msg.classList.add('hidden');
      msg.textContent = '';
      modal.classList.remove('opacity-0', 'invisible');
      const inner = modal.firstElementChild;
      if (inner) inner.classList.remove('translate-y-8');
      window.setTimeout(() => modal.querySelector('#descEditText').focus(), 50);
    }

    function closeDescEditModal() {
      if (!descEditModal) return;
      descEditModal.classList.add('opacity-0', 'invisible');
      const inner = descEditModal.firstElementChild;
      if (inner) inner.classList.add('translate-y-8');
      descEditingSite = null;
    }

    async function saveDescEdit() {
      if (!descEditingSite || !descEditModal) return;
      const site = descEditingSite;
      const textarea = descEditModal.querySelector('#descEditText');
      const saveBtn = descEditModal.querySelector('#descEditSaveBtn');
      const description = textarea.value.trim();
      if (description.length > 1000) { showDescEditMessage('描述不能超过 1000 个字符', true); return; }
      saveBtn.disabled = true;
      saveBtn.textContent = '保存中…';
      try {
        const url = decodeHtmlEntities(site.urlHtml);
        const logo = decodeHtmlEntities(site.logoUrlHtml || '');
        // 图标还是坏的 favicon.im / tc.alex.nyc.mn 链接时传空，让服务端按网址重新生成 faviconsnap 图标；
        // 其它图标原样传回，不动它。
        const logoToSend = /favicon\.im\/|tc\.alex\.nyc\.mn\//i.test(logo) ? '' : logo;
        const res = await apiFetch('/api/update-description', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: site.id, description, url, logo: logoToSend }),
        });
        let data = null;
        try { data = await res.json(); } catch { /* 非 JSON 按失败处理 */ }
        if (!res.ok) {
          showDescEditMessage('保存失败：' + ((data && data.message) || ('HTTP ' + res.status)), true);
          return;
        }
        // 原地更新卡片，不用刷新整页
        const newDescHtml = escapeHtml(description || '暂无描述');
        site.descHtml = newDescHtml;
        site.hasDesc = Boolean(description);
        document.querySelectorAll('.site-desc[data-site-id="' + site.id + '"]').forEach((el) => {
          el.textContent = description || '暂无描述';
          el.setAttribute('title', '点击编辑描述');
        });
        closeDescEditModal();
      } catch (e) {
        if (isNeedLoginError(e)) {
          showDescEditMessage('还没登录管理员：请在新标签页打开 /admin 登录，再回来点保存。', true);
          return;
        }
        showDescEditMessage('保存失败：' + (e.message || String(e)), true);
      } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = '保存';
      }
    }

    function initDescEdit() {
      if (!sitesGrid) return;
      // 捕获阶段拦截：描述在 <a> 里面，不拦住点它就直接跳去目标站了
      sitesGrid.addEventListener('click', (e) => {
        const descEl = e.target && e.target.closest ? e.target.closest('.site-desc') : null;
        if (!descEl) return;
        e.preventDefault();
        e.stopPropagation();
        openDescEditModal(descEl.getAttribute('data-site-id'));
      }, true);
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeDescEditModal();
      });
    }

    // ---- 右键菜单（桌面右键 / 移动端长按都会触发 contextmenu）----
    let contextMenuEl = null;
    let contextMenuSiteId = null;

    function getSiteById(siteId) {
      return (window.IORI_SITES || []).find((s) => String(s.id) === String(siteId)) || null;
    }

    function contextMenuIcon(path) {
      return `<svg class="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="${path}" /></svg>`;
    }

    const CONTEXT_MENU_DEFS = [
      { key: 'open', label: '当前页面打开', icon: 'M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25' },
      { key: 'openNew', label: '在新窗口中打开', icon: 'M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25zM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25z' },
      { key: 'edit', label: '编辑', icon: 'M16.862 4.487l1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931zm0 0L19.5 7.125' },
      { key: 'move', label: '移动', icon: 'M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44z' },
      { key: 'delete', label: '删除', icon: 'm14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0', danger: true },
    ];

    function ensureContextMenu() {
      if (contextMenuEl) return contextMenuEl;
      const menu = document.createElement('div');
      menu.id = 'homeContextMenu';
      menu.className = 'hidden';
      menu.innerHTML = CONTEXT_MENU_DEFS.map((item) => `
        <button type="button" data-menu-action="${item.key}" class="${item.danger ? 'danger' : ''}">
          ${contextMenuIcon(item.icon)}<span>${item.label}</span>
        </button>`).join('');
      document.body.appendChild(menu);
      menu.addEventListener('click', (e) => {
        const btn = e.target && e.target.closest ? e.target.closest('[data-menu-action]') : null;
        if (!btn) return;
        const action = btn.getAttribute('data-menu-action');
        const siteId = contextMenuSiteId;
        closeContextMenu();
        if (siteId) handleContextMenuAction(action, siteId);
      });
      contextMenuEl = menu;
      return menu;
    }

    function closeContextMenu() {
      if (contextMenuEl) contextMenuEl.classList.add('hidden');
      contextMenuSiteId = null;
    }

    function openContextMenu(siteId, clientX, clientY) {
      const site = getSiteById(siteId);
      if (!site) return;
      const menu = ensureContextMenu();
      contextMenuSiteId = siteId;
      // 没有有效链接时，两个“打开”不可点
      menu.querySelectorAll('[data-menu-action="open"], [data-menu-action="openNew"]').forEach((btn) => {
        btn.disabled = !site.hasValidUrl;
      });
      menu.classList.remove('hidden');
      // 先按点击位置放，再量尺寸往视口里收，避免菜单超出屏幕
      menu.style.left = clientX + 'px';
      menu.style.top = clientY + 'px';
      const rect = menu.getBoundingClientRect();
      const margin = 8;
      if (rect.right > window.innerWidth - margin) menu.style.left = Math.max(margin, window.innerWidth - rect.width - margin) + 'px';
      if (rect.bottom > window.innerHeight - margin) menu.style.top = Math.max(margin, window.innerHeight - rect.height - margin) + 'px';
    }

    function handleContextMenuAction(action, siteId) {
      const site = getSiteById(siteId);
      if (!site) return;
      const url = decodeHtmlEntities(site.urlHtml);
      if (action === 'open') {
        if (!site.hasValidUrl) { window.alert('这个书签没有有效链接，打不开。'); return; }
        window.location.href = url;
      } else if (action === 'openNew') {
        if (!site.hasValidUrl) { window.alert('这个书签没有有效链接，打不开。'); return; }
        window.open(url, '_blank', 'noopener');
      } else if (action === 'edit') {
        openDescEditModal(siteId);
      } else if (action === 'move') {
        openMoveSiteModal(siteId);
      } else if (action === 'delete') {
        deleteHomeSite(siteId);
      }
    }

    function initContextMenu() {
      if (!sitesGrid) return;
      sitesGrid.addEventListener('contextmenu', (e) => {
        const card = e.target && e.target.closest ? e.target.closest('.site-card') : null;
        if (!card) return; // 点到网格空白处，放行原生菜单
        e.preventDefault();
        openContextMenu(card.getAttribute('data-id'), e.clientX, e.clientY);
      });
      document.addEventListener('click', (e) => {
        if (contextMenuEl && !contextMenuEl.classList.contains('hidden')) {
          if (!e.target.closest || !e.target.closest('#homeContextMenu')) closeContextMenu();
        }
      });
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { closeContextMenu(); closeMoveSiteModal(); }
      });
      window.addEventListener('resize', closeContextMenu);
    }

    // ---- 右键菜单：删除 ----
    async function deleteHomeSite(siteId) {
      const site = getSiteById(siteId);
      const name = site ? decodeHtmlEntities(site.nameHtml) : ('#' + siteId);
      if (!window.confirm('确定删除「' + name + '」吗？删除后无法恢复。')) return;
      try {
        const res = await apiFetch('/api/config/' + siteId, { method: 'DELETE' });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          window.alert('删除失败：' + ((data && data.message) || ('HTTP ' + res.status)));
          return;
        }
        const idx = (window.IORI_SITES || []).findIndex((s) => String(s.id) === String(siteId));
        if (idx >= 0) window.IORI_SITES.splice(idx, 1);
        const card = sitesGrid && sitesGrid.querySelector('.site-card[data-id="' + siteId + '"]');
        if (card) card.remove();
        if (sitesGrid && !sitesGrid.querySelector('.site-card')) {
          sitesGrid.innerHTML = '<div class="col-span-full text-center text-gray-500 py-10">本分类下暂无书签</div>';
        }
      } catch (e) {
        if (isNeedLoginError(e)) { window.alert('请先去 /admin 登录，登录后才能删除书签。'); return; }
        window.alert('删除失败：' + (e.message || String(e)));
      }
    }

    // ---- 右键菜单：移动到分组 ----
    let moveSiteModal = null;
    let moveSiteTarget = null;
    let moveSiteCategories = [];

    // 优先用页面上已有的分类导航（横排 #horizontalCategoryNav、更多下拉、左侧 #sidebar）
    function getPageCategories() {
      const seen = new Map();
      document.querySelectorAll('#horizontalCategoryNav a[data-id], #horizontalMoreDropdown a[data-id], #sidebar a[data-id]').forEach((a) => {
        const id = a.getAttribute('data-id');
        const name = (a.textContent || '').trim();
        if (id && name && !seen.has(String(id))) seen.set(String(id), name);
      });
      return [...seen.entries()].map(([id, name]) => ({ id: Number(id), name }));
    }

    async function fetchAllCategories() {
      const res = await fetch('/api/categories?pageSize=9999', { credentials: 'same-origin' });
      const data = await res.json();
      return (data.data || []).map((c) => ({ id: c.id, name: c.catelog }));
    }

    function ensureMoveSiteModal() {
      if (moveSiteModal) return moveSiteModal;
      const modal = document.createElement('div');
      modal.id = 'moveSiteModal';
      modal.className = 'fixed inset-0 z-50 hidden items-center justify-center bg-black bg-opacity-50';
      modal.innerHTML = `
        <div class="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-md mx-4">
          <div class="p-6">
            <div class="flex items-center justify-between mb-4">
              <h2 class="text-xl font-semibold text-gray-900 dark:text-gray-100">移动到分组</h2>
              <button type="button" data-move-close class="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300">
                <svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <p class="text-sm text-gray-500 dark:text-gray-400 mb-3">正在移动：<span id="moveSiteName" class="font-medium text-gray-800 dark:text-gray-200"></span></p>
            <select id="moveSiteCategorySelect" class="block w-full px-3 py-2 border border-primary-100 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-200 focus:border-primary-400 dark:bg-gray-700 dark:text-gray-100"></select>
            <div id="moveSiteMessage" class="hidden rounded-lg border px-3 py-2 text-sm leading-relaxed mt-3"></div>
            <div class="flex justify-end pt-4">
              <button type="button" data-move-close class="bg-white dark:bg-gray-700 py-2 px-4 border border-primary-100 dark:border-gray-600 rounded-md shadow-sm text-sm font-medium text-primary-600 dark:text-primary-300 hover:bg-secondary-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-200 mr-3">取消</button>
              <button type="button" id="moveSiteSaveBtn" class="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-accent-500 hover:bg-accent-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent-400">移动</button>
            </div>
          </div>
        </div>`;
      document.body.appendChild(modal);
      modal.addEventListener('click', (e) => {
        if (e.target === modal || (e.target.closest && e.target.closest('[data-move-close]'))) closeMoveSiteModal();
      });
      modal.querySelector('#moveSiteSaveBtn').addEventListener('click', saveMoveSite);
      moveSiteModal = modal;
      return modal;
    }

    function showMoveSiteMessage(text, isError) {
      const el = moveSiteModal && moveSiteModal.querySelector('#moveSiteMessage');
      if (!el) return;
      el.classList.remove('hidden');
      el.textContent = text;
      el.className = 'rounded-lg border px-3 py-2 text-sm leading-relaxed mt-3 ' + (isError
        ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-900/30 dark:text-red-300'
        : 'border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-900/30 dark:text-green-300');
    }

    function closeMoveSiteModal() {
      if (!moveSiteModal) return;
      moveSiteModal.classList.add('hidden');
      moveSiteModal.classList.remove('flex');
      moveSiteTarget = null;
    }

    async function openMoveSiteModal(siteId) {
      const site = getSiteById(siteId);
      if (!site) return;
      moveSiteTarget = site;
      const modal = ensureMoveSiteModal();
      modal.querySelector('#moveSiteName').textContent = decodeHtmlEntities(site.nameHtml);
      const msg = modal.querySelector('#moveSiteMessage');
      msg.classList.add('hidden');
      msg.textContent = '';
      const select = modal.querySelector('#moveSiteCategorySelect');
      select.innerHTML = '<option value="">正在加载分组…</option>';
      modal.classList.remove('hidden');
      modal.classList.add('flex');
      try {
        let categories = getPageCategories();
        if (categories.length === 0) categories = await fetchAllCategories();
        moveSiteCategories = categories;
        if (categories.length === 0) {
          select.innerHTML = '<option value="">没有找到分组</option>';
          return;
        }
        select.innerHTML = categories.map((c) => `<option value="${c.id}" ${String(c.id) === String(site.catelog_id) ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('');
      } catch (e) {
        select.innerHTML = '<option value="">加载分组失败</option>';
        showMoveSiteMessage('加载分组失败：' + (e.message || String(e)), true);
      }
    }

    async function saveMoveSite() {
      if (!moveSiteTarget || !moveSiteModal) return;
      const site = moveSiteTarget;
      const select = moveSiteModal.querySelector('#moveSiteCategorySelect');
      const saveBtn = moveSiteModal.querySelector('#moveSiteSaveBtn');
      const targetId = Number(select.value);
      if (!Number.isFinite(targetId) || targetId <= 0) { showMoveSiteMessage('请先选一个分组。', true); return; }
      if (String(targetId) === String(site.catelog_id)) { closeMoveSiteModal(); return; }
      saveBtn.disabled = true;
      saveBtn.textContent = '移动中…';
      try {
        // PUT /api/config/:id 要求全量字段：用内存里该站点的现值，HTML 实体先解码
        const rawDesc = decodeHtmlEntities(site.descHtml);
        const body = {
          name: decodeHtmlEntities(site.nameHtml),
          url: decodeHtmlEntities(site.urlHtml),
          logo: decodeHtmlEntities(site.logoUrlHtml || ''),
          desc: rawDesc === '暂无描述' ? '' : rawDesc,
          catelog_id: targetId,
          sort_order: Number.isFinite(Number(site.sort_order)) ? Number(site.sort_order) : 9999,
          is_private: site.is_private ? 1 : 0,
        };
        const res = await apiFetch('/api/config/' + site.id, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          showMoveSiteMessage('移动失败：' + ((data && data.message) || ('HTTP ' + res.status)), true);
          return;
        }
        site.catelog_id = targetId;
        const target = moveSiteCategories.find((c) => c.id === targetId);
        if (target) site.catalogHtml = escapeHtml(target.name);
        // 当前在看某一分类、书签被移走了：卡片直接消失；否则原地改分组角标
        const card = sitesGrid && sitesGrid.querySelector('.site-card[data-id="' + site.id + '"]');
        if (activeRenderedCatalogId && String(targetId) !== String(activeRenderedCatalogId)) {
          if (card) card.remove();
          if (sitesGrid && !sitesGrid.querySelector('.site-card')) {
            sitesGrid.innerHTML = '<div class="col-span-full text-center text-gray-500 py-10">本分类下暂无书签</div>';
          }
        } else if (card) {
          const badge = card.querySelector('.site-category');
          if (badge && target) badge.textContent = target.name;
        }
        closeMoveSiteModal();
      } catch (e) {
        if (isNeedLoginError(e)) { showMoveSiteMessage('请先去 /admin 登录，登录后才能移动书签。', true); return; }
        showMoveSiteMessage('移动失败：' + (e.message || String(e)), true);
      } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = '移动';
      }
    }

    // ---- 首页拖动排序（仅桌面端；移动端 HTML5 DnD 不支持触摸）----
    // 写法参考后台列表 public/js/admin-bookmark-list.js 的 setupDragAndDrop
    let draggedCard = null;

    function initDragSort() {
      if (!sitesGrid) return;
      sitesGrid.addEventListener('dragstart', (e) => {
        const card = e.target && e.target.closest ? e.target.closest('.site-card') : null;
        if (!card || getCardDevice() !== 'desktop') { e.preventDefault(); return; }
        draggedCard = card;
        card.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        try { e.dataTransfer.setData('text/plain', card.getAttribute('data-id') || ''); } catch (err) { /* 忽略 */ }
      });
      sitesGrid.addEventListener('dragend', () => {
        if (draggedCard) draggedCard.classList.remove('dragging');
        draggedCard = null;
        sitesGrid.querySelectorAll('.site-card.drag-over-target').forEach((c) => c.classList.remove('drag-over-target'));
      });
      sitesGrid.addEventListener('dragover', (e) => {
        const card = e.target && e.target.closest ? e.target.closest('.site-card') : null;
        if (!card || !draggedCard || card === draggedCard) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        sitesGrid.querySelectorAll('.site-card.drag-over-target').forEach((c) => { if (c !== card) c.classList.remove('drag-over-target'); });
        card.classList.add('drag-over-target');
      });
      sitesGrid.addEventListener('dragleave', (e) => {
        const card = e.target && e.target.closest ? e.target.closest('.site-card') : null;
        if (card) card.classList.remove('drag-over-target');
      });
      sitesGrid.addEventListener('drop', (e) => {
        const card = e.target && e.target.closest ? e.target.closest('.site-card') : null;
        if (!card || !draggedCard || card === draggedCard) return;
        e.preventDefault();
        card.classList.remove('drag-over-target');
        const allCards = Array.from(sitesGrid.querySelectorAll('.site-card'));
        const draggedIdx = allCards.indexOf(draggedCard);
        const droppedIdx = allCards.indexOf(card);
        if (draggedIdx < droppedIdx) card.after(draggedCard);
        else card.before(draggedCard);
        saveHomeSortOrder();
      });
    }

    async function saveHomeSortOrder() {
      const cards = sitesGrid ? sitesGrid.querySelectorAll('.site-card') : [];
      // 当前网格顺序就是要保存的顺序：分类视图里只有该分类的卡片，全部视图是全部卡片
      const items = Array.from(cards)
        .map((card, index) => ({ id: Number(card.getAttribute('data-id')), sort_order: index }))
        .filter((item) => Number.isFinite(item.id));
      if (items.length === 0) return;
      try {
        const res = await apiFetch('/api/config/batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'reorder', payload: { items } }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          window.alert('保存排序失败：' + ((data && data.message) || ('HTTP ' + res.status)));
          renderSites(getSitesForCatalog(activeRenderedCatalogId));
          return;
        }
        // 同步回内存模型，下次渲染保持新顺序
        const sortValue = (site) => (Number.isFinite(Number(site.sort_order)) ? Number(site.sort_order) : 9999);
        items.forEach((item) => {
          const site = getSiteById(item.id);
          if (site) site.sort_order = item.sort_order;
        });
        (window.IORI_SITES || []).sort((a, b) => sortValue(a) - sortValue(b));
      } catch (e) {
        if (isNeedLoginError(e)) {
          window.alert('请先去 /admin 登录，登录后才能拖动排序。');
        } else {
          window.alert('保存排序失败：' + (e.message || String(e)));
        }
        // 保存失败就按服务端顺序重渲染，拖动不生效
        renderSites(getSitesForCatalog(activeRenderedCatalogId));
      }
    }

    // ---- 风格三悬停展开面板 ----
    // 风格三是 85px 固定高紧凑块，标题只显示两行、没有描述元素，上一轮的原地展开
    // 排不上用场。这里用 body 级 fixed 浮层按卡片位置定位：卡片有 contain: content，
    // 面板放卡片内部会被裁剪；浮层不占网格布局，不挤邻卡。
    // 只在精细指针设备上启用（触摸设备长按走右键菜单，不触发）。
    const finePointerQuery = window.matchMedia ? window.matchMedia('(hover: hover) and (pointer: fine)') : null;
    let style3HoverPanel = null;
    let style3HoverCard = null;
    let style3HoverTimer = null;

    function isStyle3HoverEnabled() {
      return !!finePointerQuery && finePointerQuery.matches;
    }

    function ensureStyle3HoverPanel() {
      if (style3HoverPanel) return style3HoverPanel;
      const panel = document.createElement('div');
      panel.className = 'style3-hover-panel';
      panel.setAttribute('aria-hidden', 'true');
      document.body.appendChild(panel);
      style3HoverPanel = panel;
      return panel;
    }

    function hideStyle3HoverPanel() {
      if (style3HoverTimer) { window.clearTimeout(style3HoverTimer); style3HoverTimer = null; }
      if (style3HoverPanel) style3HoverPanel.classList.remove('visible');
      style3HoverCard = null;
    }

    function showStyle3HoverPanel(card) {
      if (!isStyle3HoverEnabled() || !card || !card.classList.contains('style-3')) return;
      // 进场动画还在跑时卡片位置未定，等动画清掉 card-anim-enter 再出现
      if (card.classList.contains('card-anim-enter')) return;
      // 正在拖动排序时不出现
      if (draggedCard) return;
      const site = getSiteById(card.getAttribute('data-id'));
      if (!site) return;
      const panel = ensureStyle3HoverPanel();
      const name = decodeHtmlEntities(site.nameHtml || '');
      const rawDesc = decodeHtmlEntities(site.descHtml || '');
      const desc = (site.hasDesc && rawDesc && rawDesc !== '暂无描述') ? rawDesc : '暂无描述';
      const url = decodeHtmlEntities(site.displayUrlHtml || site.urlHtml || '');
      const logo = decodeHtmlEntities(site.logoUrlHtml || '');
      panel.innerHTML = `
        <div class="style3-hover-head">
          ${logo ? `<img src="${escapeHtml(logo)}" alt="" draggable="false" onerror="this.style.display='none';var f=this.parentElement.querySelector('.style3-hover-fallback');if(f){f.style.display='flex';}">` : ''}
          <div class="style3-hover-fallback" style="${logo ? 'display:none;' : ''}">${escapeHtml(site.cardInitialHtml || '站')}</div>
          <div class="style3-hover-title">${escapeHtml(name)}</div>
        </div>
        <div class="style3-hover-desc">${escapeHtml(desc)}</div>
        ${url ? `<div class="style3-hover-url">${escapeHtml(url)}</div>` : ''}`;
      panel.classList.toggle('frosted', card.classList.contains('frosted-glass-effect'));
      // 先离屏显示量高度，再定位到卡片上（只过渡 opacity，不做位移，不闪烁）
      panel.classList.add('visible');
      panel.style.left = '-9999px';
      panel.style.top = '0px';
      const rect = card.getBoundingClientRect();
      const padX = 12;
      const padTop = 10;
      const margin = 8;
      const width = rect.width + padX * 2;
      const height = panel.offsetHeight;
      let left = rect.left - padX;
      let top = rect.top - padTop;
      if (left < margin) left = margin;
      if (left + width > window.innerWidth - margin) left = Math.max(margin, window.innerWidth - width - margin);
      if (top + height > window.innerHeight - margin) top = Math.max(margin, window.innerHeight - height - margin);
      if (top < margin) top = margin;
      panel.style.width = width + 'px';
      panel.style.left = left + 'px';
      panel.style.top = top + 'px';
      style3HoverCard = card;
    }

    function initStyle3Hover() {
      if (!sitesGrid || !isStyle3HoverEnabled()) return;
      sitesGrid.addEventListener('mouseover', (e) => {
        const card = e.target && e.target.closest ? e.target.closest('.site-card.style-3') : null;
        if (!card) return;
        if (style3HoverCard === card && style3HoverPanel && style3HoverPanel.classList.contains('visible')) return;
        if (style3HoverTimer) window.clearTimeout(style3HoverTimer);
        style3HoverTimer = window.setTimeout(() => { style3HoverTimer = null; showStyle3HoverPanel(card); }, 120);
      });
      sitesGrid.addEventListener('mouseout', (e) => {
        const card = e.target && e.target.closest ? e.target.closest('.site-card.style-3') : null;
        if (!card) return;
        // 移到同一卡片的子元素上不算离开
        if (e.relatedTarget && card.contains(e.relatedTarget)) return;
        if (style3HoverCard === card || style3HoverTimer) hideStyle3HoverPanel();
      });
      // 滚动、右键、拖动时收起面板
      document.addEventListener('scroll', hideStyle3HoverPanel, true);
      window.addEventListener('resize', hideStyle3HoverPanel);
      sitesGrid.addEventListener('contextmenu', hideStyle3HoverPanel);
      sitesGrid.addEventListener('dragstart', hideStyle3HoverPanel);
    }

    function init() {
      initDescEdit();
      initContextMenu();
      initDragSort();
      initStyle3Hover();
      animateCardBatch(initialCards);
      initialCards.forEach((card) => {
        bindCardAnimationCleanup(card);
      });

      mobileCardQuery?.addEventListener('change', () => {
        syncCardConfigForViewport();
      });

      // 视口跨断点会改变 CSS 网格列数，缓存必须失效
      window.addEventListener('resize', invalidateAnimationColumnCount);

      if (getCardDevice() === 'mobile') {
        syncCardConfigForViewport({ force: true });
      }
    }

    return {
      init,
      renderSites,
      getSitesForCatalog,
      setActiveCatalogId(catalogId) {
        activeRenderedCatalogId = catalogId ? String(catalogId) : null;
      },
    };
  };
})();
