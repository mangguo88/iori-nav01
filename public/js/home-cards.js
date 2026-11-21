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
          ? `<img src="${site.logoUrlHtml}" alt="${site.nameHtml}" width="40" height="40" class="${cardConfig.logoClass}" ${imgLoadingAttrs} onerror="this.style.display='none';var f=this.parentElement.querySelector('.site-logo-fallback');if(f){f.style.display='flex';}">`
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

        card.innerHTML = `
        <div class="site-card-content">
          <a href="${site.urlHtml || '#'}" ${site.hasValidUrl ? 'target="_blank" rel="noopener noreferrer"' : ''} class="block">
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
        // 图标还是坏的 favicon.im 链接时传空，让服务端按网址重新生成 faviconsnap 图标；
        // 其它图标原样传回，不动它。
        const logoToSend = /favicon\.im\//i.test(logo) ? '' : logo;
        const res = await fetch('/api/update-description', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ id: site.id, description, url, logo: logoToSend }),
        });
        let data = null;
        try { data = await res.json(); } catch { /* 非 JSON 按失败处理 */ }
        if (res.status === 401) {
          showDescEditMessage('还没登录管理员：请在新标签页打开 /admin 登录，再回来点保存。', true);
          return;
        }
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

    function init() {
      initDescEdit();
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
