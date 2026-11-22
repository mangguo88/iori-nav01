(function () {
  const Home = window.IoriHome = window.IoriHome || {};

  Home.initCategoryNavigation = function () {
    const navContainer = document.getElementById('horizontalCategoryNav');
    const moreWrapper = document.getElementById('horizontalMoreWrapper');
    const moreBtn = document.getElementById('horizontalMoreBtn');
    const dropdown = document.getElementById('horizontalMoreDropdown');
    const cardController = Home.cardController;
    let checkOverflow = () => { };
    let resetNav = () => { };
    // 图标栏钉住状态刷新（initDockStuckState 里赋值；切分类显隐图标栏时也要调一次）
    let updateDockStuckState = () => { };

    // moreWrapper 仅在设置「分类展示=单行」时由 SSR 输出；多行模式无此节点，不进入折叠逻辑
    if (navContainer && moreWrapper && moreBtn && dropdown) {
      resetNav = () => {
        const dropdownItems = Array.from(dropdown.children);
        dropdownItems.forEach(item => {
          if (item.dataset.originalClass) item.className = item.dataset.originalClass;
          const link = item.querySelector('a');
          if (link && link.dataset.originalClass) link.className = link.dataset.originalClass;
          navContainer.insertBefore(item, moreWrapper);
        });
        moreWrapper.classList.add('hidden');
        moreBtn.classList.remove('active', 'text-primary-600', 'bg-secondary-100');
        moreBtn.classList.add('inactive');
      };

      const getCategories = () => Array.from(navContainer.children).filter(el => el !== moreWrapper);

      const getVisibleItems = () => Array.from(navContainer.children).filter((el) => {
        if (el === moreWrapper) return !moreWrapper.classList.contains('hidden');
        return true;
      });

      // 单行统一为最多 8 个按钮：根分类（含「全部」）+ 「更多」
      // 有「更多」时根分类最多 7 个；顶部/搜索框上/下位置数量一致
      const MAX_VISIBLE_BUTTONS = 8;
      const MAX_VISIBLE_ROOT_WITH_MORE = MAX_VISIBLE_BUTTONS - 1; // 7

      // 与后台预览 collapseOverflowCategories 一致：按可用宽度折叠
      const measureItemsWidth = () => {
        const styles = window.getComputedStyle(navContainer);
        const gap = parseFloat(styles.columnGap || styles.gap || '0') || 0;
        return getVisibleItems().reduce((total, item, index) => (
          total + item.offsetWidth + (index > 0 ? gap : 0)
        ), 0);
      };

      const needsCollapse = (availableWidth) => {
        const count = getCategories().length;
        // 超过 7 个根分类，或宽度放不下（名称很长/窄屏）
        if (count > MAX_VISIBLE_ROOT_WITH_MORE) return true;
        void navContainer.offsetWidth;
        return measureItemsWidth() > availableWidth;
      };

      const moveCategoryToDropdown = (lastCategory) => {
        if (!lastCategory.dataset.originalClass) {
          lastCategory.dataset.originalClass = lastCategory.className;
        }

        lastCategory.className = 'menu-item-wrapper block w-full relative';

        const link = lastCategory.querySelector('a');
        if (link) {
          link.dataset.originalClass = link.className;
          const isActive = link.classList.contains('active');
          link.className = 'dropdown-item w-full text-left px-4 py-2 text-sm';
          if (isActive) link.classList.add('active');
        }

        dropdown.insertBefore(lastCategory, dropdown.firstChild);
      };

      const restoreCategoryFromDropdown = () => {
        const item = dropdown.firstElementChild;
        if (!item) return null;
        if (item.dataset.originalClass) item.className = item.dataset.originalClass;
        const link = item.querySelector('a');
        if (link && link.dataset.originalClass) link.className = link.dataset.originalClass;
        navContainer.insertBefore(item, moreWrapper);
        return item;
      };

      checkOverflow = () => {
        // 「更多」打开时不要 reset，否则会拆掉弹出层并关菜单
        if (!dropdown.classList.contains('hidden')) return;

        resetNav();
        // 必须 visible，否则多级 hover 下拉与 #horizontalMoreDropdown 会被裁切
        navContainer.style.overflow = 'visible';
        if (navContainer.parentElement) {
          navContainer.parentElement.style.overflow = 'visible';
        }

        const navChildren = getCategories();
        if (navChildren.length === 0) return;

        const availableWidth = navContainer.clientWidth || navContainer.parentElement?.clientWidth || 0;
        // 布局未完成时跳过，后续 ResizeObserver / fonts 会再算
        if (availableWidth < 48) return;

        // 1) 根分类 >7 → 先收到 7 个，保证各位置统一为 7+更多=8
        // 2) 宽度仍不够（≤7 但名称很长/窄屏）→ 继续按宽度收，至少保留 1 个
        void navContainer.offsetWidth;
        if (!needsCollapse(availableWidth)) return;

        moreWrapper.classList.remove('hidden');

        while (getCategories().length > MAX_VISIBLE_ROOT_WITH_MORE) {
          const cats = getCategories();
          moveCategoryToDropdown(cats[cats.length - 1]);
        }

        while (getCategories().length > 1 && measureItemsWidth() > availableWidth) {
          const cats = getCategories();
          moveCategoryToDropdown(cats[cats.length - 1]);
        }

        // 禁止只剩「···」
        if (getCategories().length === 0) {
          restoreCategoryFromDropdown();
        }

        // 折叠区仅剩 1 个分类时直接展示，不为 1 个分类留「···」：
        // 「···」只比一个分类按钮窄约 48px，折叠换不来实际空间
        if (dropdown.children.length === 1) {
          restoreCategoryFromDropdown();
          moreWrapper.classList.add('hidden');
        }

        const activeInDropdown = dropdown.querySelector('.active');
        if (activeInDropdown) {
          moreBtn.classList.add('active');
          moreBtn.classList.remove('inactive');
          moreBtn.classList.add('text-primary-600', 'bg-secondary-100');
        } else {
          moreBtn.classList.remove('active', 'text-primary-600', 'bg-secondary-100');
          moreBtn.classList.add('inactive');
        }
      };

      const scheduleOverflowCheck = () => {
        clearTimeout(window.resizeTimer);
        window.resizeTimer = setTimeout(checkOverflow, 50);
      };

      // 首屏多次测量：覆盖字体加载与异步布局
      requestAnimationFrame(() => {
        requestAnimationFrame(checkOverflow);
      });
      setTimeout(checkOverflow, 100);
      setTimeout(checkOverflow, 400);
      if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(scheduleOverflowCheck).catch(() => {});
      }

      window.addEventListener('resize', scheduleOverflowCheck);
      if (typeof ResizeObserver !== 'undefined') {
        const ro = new ResizeObserver(scheduleOverflowCheck);
        ro.observe(navContainer);
        if (navContainer.parentElement) ro.observe(navContainer.parentElement);
      }

      moreBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const isHidden = dropdown.classList.contains('hidden');
        if (isHidden) {
          dropdown.classList.remove('hidden');
          dropdown.classList.add('show');
          document.body.classList.add('menu-open');
        } else {
          dropdown.classList.add('hidden');
          dropdown.classList.remove('show');
          document.body.classList.remove('menu-open');
        }
      });

      dropdown.addEventListener('click', (e) => {
        const link = e.target.closest('a');
        if (link) {
          dropdown.classList.add('hidden');
          dropdown.classList.remove('show');
          document.body.classList.remove('menu-open');
        }
      });

      document.addEventListener('click', (e) => {
        if (!dropdown.contains(e.target) && !moreBtn.contains(e.target)) {
          dropdown.classList.add('hidden');
          dropdown.classList.remove('show');
          document.body.classList.remove('menu-open');
        }
      });
    }

    // ---- 左侧栏文件夹树：折叠/展开（状态存 localStorage）----
    const SIDEBAR_COLLAPSED_KEY = 'iori_sidebar_collapsed_v1';

    function getSidebarCollapsedPaths() {
      try {
        const raw = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
        const arr = raw ? JSON.parse(raw) : [];
        return new Set(Array.isArray(arr) ? arr.filter((p) => typeof p === 'string') : []);
      } catch (e) { return new Set(); }
    }

    function saveSidebarCollapsedPaths(set) {
      try { localStorage.setItem(SIDEBAR_COLLAPSED_KEY, JSON.stringify([...set])); } catch (e) { /* 隐私模式等写不进时静默忽略 */ }
    }

    function setSidebarNodeCollapsed(node, collapsed) {
      node.classList.toggle('is-collapsed', collapsed);
      const toggle = node.querySelector(':scope > .sidebar-tree-row .sidebar-tree-toggle');
      if (toggle) toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    }

    // 把指定分类的祖先节点展开（客户端切换分类后，高亮项可能藏在收起的父节点里）
    function expandSidebarAncestors(catalogId) {
      const sidebar = document.getElementById('sidebar');
      if (!sidebar || !catalogId) return;
      const link = sidebar.querySelector(`a[data-id="${catalogId}"]`);
      if (!link) return;
      const collapsed = getSidebarCollapsedPaths();
      let changed = false;
      let node = link.closest('.sidebar-tree-node');
      while (node) {
        if (node.classList.contains('is-collapsed')) {
          setSidebarNodeCollapsed(node, false);
          collapsed.delete(node.getAttribute('data-tree-path'));
          changed = true;
        }
        node = node.parentElement.closest('.sidebar-tree-node');
      }
      if (changed) saveSidebarCollapsedPaths(collapsed);
    }

    function initSidebarTree() {
      const sidebar = document.getElementById('sidebar');
      if (!sidebar) return;
      const nodes = Array.from(sidebar.querySelectorAll('.sidebar-tree-node[data-tree-path]'));
      if (nodes.length === 0) return;

      // 当前选中分类的祖先节点强制展开（即使之前收起过），保证高亮可见；
      // 只改 DOM，不改存着的折叠记录
      const activePaths = new Set();
      const activeLink = sidebar.querySelector('.sidebar-tree-node a[data-id].bg-secondary-100');
      if (activeLink) {
        let node = activeLink.closest('.sidebar-tree-node');
        while (node) {
          activePaths.add(node.getAttribute('data-tree-path'));
          node = node.parentElement.closest('.sidebar-tree-node');
        }
      }

      const collapsed = getSidebarCollapsedPaths();
      nodes.forEach((node) => {
        const path = node.getAttribute('data-tree-path');
        if (collapsed.has(path) && !activePaths.has(path)) setSidebarNodeCollapsed(node, true);
      });

      const toggleNode = (node) => {
        const path = node.getAttribute('data-tree-path');
        const willCollapse = !node.classList.contains('is-collapsed');
        setSidebarNodeCollapsed(node, willCollapse);
        const set = getSidebarCollapsedPaths();
        if (willCollapse) set.add(path); else set.delete(path);
        saveSidebarCollapsedPaths(set);
      };

      sidebar.addEventListener('click', (e) => {
        const toggle = e.target.closest('.sidebar-tree-toggle');
        if (toggle) {
          const node = toggle.closest('.sidebar-tree-node');
          if (node) toggleNode(node);
          return;
        }
        // 虚拟分组头（没有真实分类）：点名称只折叠/展开，不跳转
        const group = e.target.closest('.sidebar-tree-group');
        if (group) {
          const node = group.closest('.sidebar-tree-node');
          if (node) toggleNode(node);
        }
      });

      const expandAllBtn = document.getElementById('sidebarExpandAllBtn');
      if (expandAllBtn) {
        expandAllBtn.addEventListener('click', () => {
          nodes.forEach((node) => setSidebarNodeCollapsed(node, false));
          saveSidebarCollapsedPaths(new Set());
        });
      }
      const collapseAllBtn = document.getElementById('sidebarCollapseAllBtn');
      if (collapseAllBtn) {
        collapseAllBtn.addEventListener('click', () => {
          const set = new Set();
          nodes.forEach((node) => {
            const path = node.getAttribute('data-tree-path');
            if (activePaths.has(path)) return; // 当前分类的祖先保持展开
            setSidebarNodeCollapsed(node, true);
            set.add(path);
          });
          saveSidebarCollapsedPaths(set);
        });
      }
    }

    // ---- 左侧栏显示方式：树形 / 小舒（选择存 localStorage，默认小舒）----
    const SIDEBAR_MODE_KEY = 'iori_sidebar_mode_v1';

    function getSidebarMode() {
      try {
        return localStorage.getItem(SIDEBAR_MODE_KEY) === 'tree' ? 'tree' : 'botab';
      } catch (e) { return 'botab'; }
    }

    function applySidebarMode(mode) {
      const sidebar = document.getElementById('sidebar');
      if (!sidebar) return;
      sidebar.classList.toggle('sidebar-mode-tree', mode === 'tree');
      sidebar.classList.toggle('sidebar-mode-botab', mode !== 'tree');
      const botabBtn = document.getElementById('sidebarModeBotabBtn');
      const treeBtn = document.getElementById('sidebarModeTreeBtn');
      if (botabBtn) botabBtn.classList.toggle('is-active', mode !== 'tree');
      if (treeBtn) treeBtn.classList.toggle('is-active', mode === 'tree');
    }

    function initSidebarMode() {
      const mode = getSidebarMode();
      applySidebarMode(mode);
      const botabBtn = document.getElementById('sidebarModeBotabBtn');
      const treeBtn = document.getElementById('sidebarModeTreeBtn');
      const save = (next) => {
        try { localStorage.setItem(SIDEBAR_MODE_KEY, next); } catch (e) { /* 隐私模式等写不进时静默忽略 */ }
        applySidebarMode(next);
      };
      if (botabBtn) botabBtn.addEventListener('click', () => save('botab'));
      if (treeBtn) treeBtn.addEventListener('click', () => save('tree'));
    }

    // ---- 侧栏设置：宽度 + 底色（选择存 localStorage，树形/小舒两种模式都生效）----
    // 宽度与内容区左边距共用 --sidebar-w 变量联动；<head> 里的内联脚本已在绘制前
    // 恢复过一次，这里只同步控件状态并接管后续改动。
    const SIDEBAR_WIDTH_KEY = 'iori_sidebar_width_v1';
    const SIDEBAR_BG_KEY = 'iori_sidebar_bg_v1';
    const SIDEBAR_WIDTH_DEFAULT = 256;
    const SIDEBAR_WIDTH_MIN = 200;
    const SIDEBAR_WIDTH_MAX = 320;
    const SIDEBAR_BG_VALUES = ['default', 'white', 'gray', 'dark'];

    function clampSidebarWidth(value) {
      const n = parseInt(value, 10);
      if (!Number.isFinite(n)) return SIDEBAR_WIDTH_DEFAULT;
      return Math.min(SIDEBAR_WIDTH_MAX, Math.max(SIDEBAR_WIDTH_MIN, n));
    }

    function getSidebarWidth() {
      try { return clampSidebarWidth(localStorage.getItem(SIDEBAR_WIDTH_KEY)); }
      catch (e) { return SIDEBAR_WIDTH_DEFAULT; }
    }

    function getSidebarBg() {
      try {
        const v = localStorage.getItem(SIDEBAR_BG_KEY);
        return SIDEBAR_BG_VALUES.indexOf(v) >= 0 ? v : 'default';
      } catch (e) { return 'default'; }
    }

    function applySidebarWidth(px) {
      document.documentElement.style.setProperty('--sidebar-w', px + 'px');
      const range = document.getElementById('sidebarWidthRange');
      if (range) range.value = String(px);
      const valueEl = document.getElementById('sidebarWidthValue');
      if (valueEl) valueEl.textContent = px + 'px';
    }

    function applySidebarBg(bg) {
      if (bg === 'default') document.documentElement.removeAttribute('data-sidebar-bg');
      else document.documentElement.setAttribute('data-sidebar-bg', bg);
      const swatches = document.querySelectorAll('#sidebarBgSwatches .sidebar-bg-swatch');
      swatches.forEach((btn) => btn.classList.toggle('is-active', btn.getAttribute('data-sidebar-bg') === bg));
    }

    // ---- 侧栏设置：字体颜色 + 字体大小（与底色同一面板）----
    const SIDEBAR_FONT_COLOR_KEY = 'iori_sidebar_font_color_v1';
    const SIDEBAR_FONT_SIZE_KEY = 'iori_sidebar_font_size_v1';
    const SIDEBAR_FONT_COLOR_VALUES = ['default', 'gray', 'blue', 'white'];
    const SIDEBAR_FONT_SIZE_DEFAULT = 14;
    const SIDEBAR_FONT_SIZE_MIN = 13;
    const SIDEBAR_FONT_SIZE_MAX = 18;

    function clampSidebarFontSize(value) {
      const n = parseInt(value, 10);
      if (!Number.isFinite(n)) return SIDEBAR_FONT_SIZE_DEFAULT;
      return Math.min(SIDEBAR_FONT_SIZE_MAX, Math.max(SIDEBAR_FONT_SIZE_MIN, n));
    }

    function getSidebarFontColor() {
      try {
        const v = localStorage.getItem(SIDEBAR_FONT_COLOR_KEY);
        return SIDEBAR_FONT_COLOR_VALUES.indexOf(v) >= 0 ? v : 'default';
      } catch (e) { return 'default'; }
    }

    function getSidebarFontSize() {
      try { return clampSidebarFontSize(localStorage.getItem(SIDEBAR_FONT_SIZE_KEY)); }
      catch (e) { return SIDEBAR_FONT_SIZE_DEFAULT; }
    }

    function applySidebarFontColor(color) {
      if (color === 'default') document.documentElement.removeAttribute('data-sidebar-font-color');
      else document.documentElement.setAttribute('data-sidebar-font-color', color);
      const swatches = document.querySelectorAll('#sidebarFontColorSwatches .sidebar-font-swatch');
      swatches.forEach((btn) => btn.classList.toggle('is-active', btn.getAttribute('data-sidebar-font-color') === color));
    }

    function applySidebarFontSize(px) {
      document.documentElement.style.setProperty('--sidebar-font-size', px + 'px');
      const range = document.getElementById('sidebarFontSizeRange');
      if (range) range.value = String(px);
      const valueEl = document.getElementById('sidebarFontSizeValue');
      if (valueEl) valueEl.textContent = px + 'px';
    }

    function initSidebarSettings() {
      const panel = document.getElementById('sidebarSettingsPanel');
      const toggleBtn = document.getElementById('sidebarSettingsBtn');
      if (toggleBtn && panel) {
        toggleBtn.addEventListener('click', () => panel.classList.toggle('hidden'));
      }
      const range = document.getElementById('sidebarWidthRange');
      if (range) {
        range.addEventListener('input', () => {
          const px = clampSidebarWidth(range.value);
          try { localStorage.setItem(SIDEBAR_WIDTH_KEY, String(px)); } catch (e) { /* 隐私模式等写不进时静默忽略 */ }
          applySidebarWidth(px);
        });
      }
      const swatches = document.querySelectorAll('#sidebarBgSwatches .sidebar-bg-swatch');
      swatches.forEach((btn) => {
        btn.addEventListener('click', () => {
          const bg = btn.getAttribute('data-sidebar-bg');
          if (SIDEBAR_BG_VALUES.indexOf(bg) < 0) return;
          try { localStorage.setItem(SIDEBAR_BG_KEY, bg); } catch (e) { /* 隐私模式等写不进时静默忽略 */ }
          applySidebarBg(bg);
        });
      });
      const fontSwatches = document.querySelectorAll('#sidebarFontColorSwatches .sidebar-font-swatch');
      fontSwatches.forEach((btn) => {
        btn.addEventListener('click', () => {
          const color = btn.getAttribute('data-sidebar-font-color');
          if (SIDEBAR_FONT_COLOR_VALUES.indexOf(color) < 0) return;
          try { localStorage.setItem(SIDEBAR_FONT_COLOR_KEY, color); } catch (e) { /* 隐私模式等写不进时静默忽略 */ }
          applySidebarFontColor(color);
        });
      });
      const fontRange = document.getElementById('sidebarFontSizeRange');
      if (fontRange) {
        fontRange.addEventListener('input', () => {
          const px = clampSidebarFontSize(fontRange.value);
          try { localStorage.setItem(SIDEBAR_FONT_SIZE_KEY, String(px)); } catch (e) { /* 隐私模式等写不进时静默忽略 */ }
          applySidebarFontSize(px);
        });
      }
      // 与 <head> 里提前恢复的值同步一次控件状态
      applySidebarWidth(getSidebarWidth());
      applySidebarBg(getSidebarBg());
      applySidebarFontColor(getSidebarFontColor());
      applySidebarFontSize(getSidebarFontSize());
    }

    // ---- 图标栏设置：对齐 + 图标大小 + 间距（齿轮浮层，记 localStorage，默认居中）----
    const DOCK_ALIGN_KEY = 'iori_dock_align_v1';
    const DOCK_SIZE_KEY = 'iori_dock_size_v1';
    const DOCK_GAP_KEY = 'iori_dock_gap_v1';
    const DOCK_FONT_COLOR_KEY = 'iori_dock_font_color_v1';
    const DOCK_FONT_COLOR_VALUES = ['default', 'white', 'gray', 'blue'];
    const DOCK_ALIGN_VALUES = ['left', 'center', 'right'];
    const DOCK_SIZE_DEFAULT = 64;
    const DOCK_SIZE_MIN = 48;
    const DOCK_SIZE_MAX = 80;
    const DOCK_GAP_DEFAULT = 16;
    const DOCK_GAP_MIN = 8;
    const DOCK_GAP_MAX = 32;

    function clampDockSize(value) {
      const n = parseInt(value, 10);
      if (!Number.isFinite(n)) return DOCK_SIZE_DEFAULT;
      return Math.min(DOCK_SIZE_MAX, Math.max(DOCK_SIZE_MIN, n));
    }

    function clampDockGap(value) {
      const n = parseInt(value, 10);
      if (!Number.isFinite(n)) return DOCK_GAP_DEFAULT;
      return Math.min(DOCK_GAP_MAX, Math.max(DOCK_GAP_MIN, n));
    }

    function getDockAlign() {
      try {
        const v = localStorage.getItem(DOCK_ALIGN_KEY);
        return DOCK_ALIGN_VALUES.indexOf(v) >= 0 ? v : 'center';
      } catch (e) { return 'center'; }
    }

    function getDockSize() {
      try { return clampDockSize(localStorage.getItem(DOCK_SIZE_KEY)); }
      catch (e) { return DOCK_SIZE_DEFAULT; }
    }

    function getDockGap() {
      try { return clampDockGap(localStorage.getItem(DOCK_GAP_KEY)); }
      catch (e) { return DOCK_GAP_DEFAULT; }
    }

    function getDockFontColor() {
      try {
        const v = localStorage.getItem(DOCK_FONT_COLOR_KEY);
        return DOCK_FONT_COLOR_VALUES.indexOf(v) >= 0 ? v : 'default';
      } catch (e) { return 'default'; }
    }

    function applyDockFontColor(color) {
      if (color === 'default') document.documentElement.removeAttribute('data-dock-font-color');
      else document.documentElement.setAttribute('data-dock-font-color', color);
      const swatches = document.querySelectorAll('#dockFontColorSwatches .dock-font-swatch');
      swatches.forEach((btn) => btn.classList.toggle('is-active', btn.getAttribute('data-dock-font-color') === color));
    }

    function applyDockAlign(align) {
      if (align === 'center') document.documentElement.removeAttribute('data-dock-align');
      else document.documentElement.setAttribute('data-dock-align', align);
      const btns = document.querySelectorAll('#dockAlignBtns .dock-align-btn');
      btns.forEach((btn) => btn.classList.toggle('is-active', btn.getAttribute('data-dock-align') === align));
    }

    function applyDockSize(px) {
      document.documentElement.style.setProperty('--dock-icon-size', px + 'px');
      const range = document.getElementById('dockSizeRange');
      if (range) range.value = String(px);
      const valueEl = document.getElementById('dockSizeValue');
      if (valueEl) valueEl.textContent = px + 'px';
    }

    function applyDockGap(px) {
      document.documentElement.style.setProperty('--dock-gap', px + 'px');
      const range = document.getElementById('dockGapRange');
      if (range) range.value = String(px);
      const valueEl = document.getElementById('dockGapValue');
      if (valueEl) valueEl.textContent = px + 'px';
    }

    // ---- 搜索栏收起/展开：图标栏右端的放大镜按钮，记 localStorage，刷新后保持 ----
    const SEARCH_HIDDEN_KEY = 'iori_search_hidden_v1';

    function getSearchHidden() {
      try { return localStorage.getItem(SEARCH_HIDDEN_KEY) === '1'; }
      catch (e) { return false; }
    }

    function applySearchHidden(hidden) {
      if (hidden) document.documentElement.setAttribute('data-search-hidden', '1');
      else document.documentElement.removeAttribute('data-search-hidden');
      const btn = document.getElementById('searchToggleBtn');
      if (btn) {
        btn.classList.toggle('is-off', hidden);
        btn.title = hidden ? '显示搜索栏' : '隐藏搜索栏';
        btn.setAttribute('aria-pressed', hidden ? 'true' : 'false');
      }
    }

    function initSearchToggle() {
      const btn = document.getElementById('searchToggleBtn');
      if (!btn) return; // 按钮在右上角按钮组里，所有视图都有；极少数旧缓存模板里没有才跳过
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const hidden = !getSearchHidden();
        try { localStorage.setItem(SEARCH_HIDDEN_KEY, hidden ? '1' : '0'); } catch (err) { /* 隐私模式等写不进时静默忽略 */ }
        applySearchHidden(hidden);
      });
      // 与 <head> 里提前恢复的值同步一次按钮状态
      applySearchHidden(getSearchHidden());
    }

    function initDockSettings() {
      const panel = document.getElementById('dockSettingsPanel');
      const toggleBtn = document.getElementById('dockSettingsBtn');
      if (!panel || !toggleBtn) return; // 图标栏只在“全部”与“收藏夹栏”视图显示
      toggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        panel.classList.toggle('hidden');
      });
      document.addEventListener('click', (e) => {
        if (panel.classList.contains('hidden')) return;
        if (!e.target.closest || (!e.target.closest('#dockSettingsPanel') && !e.target.closest('#dockSettingsBtn'))) {
          panel.classList.add('hidden');
        }
      });
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') panel.classList.add('hidden');
      });
      const alignBtns = document.querySelectorAll('#dockAlignBtns .dock-align-btn');
      alignBtns.forEach((btn) => {
        btn.addEventListener('click', () => {
          const align = btn.getAttribute('data-dock-align');
          if (DOCK_ALIGN_VALUES.indexOf(align) < 0) return;
          try { localStorage.setItem(DOCK_ALIGN_KEY, align); } catch (e) { /* 隐私模式等写不进时静默忽略 */ }
          applyDockAlign(align);
        });
      });
      const sizeRange = document.getElementById('dockSizeRange');
      if (sizeRange) {
        sizeRange.addEventListener('input', () => {
          const px = clampDockSize(sizeRange.value);
          try { localStorage.setItem(DOCK_SIZE_KEY, String(px)); } catch (e) { /* 隐私模式等写不进时静默忽略 */ }
          applyDockSize(px);
        });
      }
      const gapRange = document.getElementById('dockGapRange');
      if (gapRange) {
        gapRange.addEventListener('input', () => {
          const px = clampDockGap(gapRange.value);
          try { localStorage.setItem(DOCK_GAP_KEY, String(px)); } catch (e) { /* 隐私模式等写不进时静默忽略 */ }
          applyDockGap(px);
        });
      }
      const fontSwatches = document.querySelectorAll('#dockFontColorSwatches .dock-font-swatch');
      fontSwatches.forEach((btn) => {
        btn.addEventListener('click', () => {
          const color = btn.getAttribute('data-dock-font-color');
          if (DOCK_FONT_COLOR_VALUES.indexOf(color) < 0) return;
          try { localStorage.setItem(DOCK_FONT_COLOR_KEY, color); } catch (e) { /* 隐私模式等写不进时静默忽略 */ }
          applyDockFontColor(color);
        });
      });
      // 与 <head> 里提前恢复的值同步一次控件状态
      applyDockAlign(getDockAlign());
      applyDockSize(getDockSize());
      applyDockGap(getDockGap());
      applyDockFontColor(getDockFontColor());
    }

    // ---- 图标栏钉住时加实底：平时透明浮在壁纸上；滚到顶部钉住后卡片从栏下
    // 划过时被实底挡住，不与圆下面的标签字重叠；滚回顶部恢复透明。
    // 用 getBoundingClientRect 判断：sticky 钉住时栏顶贴住滚动容器顶。
    function initDockStuckState() {
      const strip = document.getElementById('rootStrip');
      const scroller = document.getElementById('app-scroll');
      if (!strip || !scroller) return;
      // 标题区滚动自动收起：页面一滑动（滚过约 10px）就收起标题块，只剩图标栏
      // 钉在上面；滚回顶部恢复。5px 回差避免在阈值附近来回抖动。
      const titleBlock = document.querySelector('.home-title-block');
      const updateTitleCollapseState = () => {
        if (!titleBlock) return;
        if (scroller.scrollTop > 10) titleBlock.classList.add('is-collapsed');
        else if (scroller.scrollTop < 5) titleBlock.classList.remove('is-collapsed');
      };
      let ticking = false;
      updateDockStuckState = () => {
        ticking = false;
        updateTitleCollapseState();
        if (strip.classList.contains('hidden')) return;
        const stuck = strip.getBoundingClientRect().top <= scroller.getBoundingClientRect().top + 1;
        strip.classList.toggle('is-stuck', stuck);
      };
      const requestUpdate = () => {
        if (!ticking) {
          ticking = true;
          requestAnimationFrame(updateDockStuckState);
        }
      };
      scroller.addEventListener('scroll', requestUpdate, { passive: true });
      window.addEventListener('resize', requestUpdate);
      updateDockStuckState();
    }

    // ---- 胶囊形子分类：站内切换分类时按 window.IORI_CAPSULES 重绘 ----
    function escapeCapsuleHtml(text) {
      return String(text ?? '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function updateCapsules(catalogId) {
      const wrap = document.getElementById('subCapsules');
      if (!wrap) return;
      // 统计标题行已去掉，外层 .home-stats-row 现在只包胶囊：站内切分类时外层也要跟着显隐，
      // 否则从无胶囊的分类切到有胶囊的分类时，胶囊会被藏在 hidden 的外层里看不见。
      const row = wrap.closest('.home-stats-row');
      const map = window.IORI_CAPSULES || {};
      const entry = (!catalogId ? null : map[String(catalogId)]) || null;
      if (!entry || !entry.items || entry.items.length === 0) {
        wrap.classList.add('hidden');
        wrap.innerHTML = '';
        if (row) row.classList.add('hidden');
        return;
      }
      wrap.innerHTML = entry.items.map((item) => {
        const isActive = entry.activeId !== null && entry.activeId !== undefined && String(item.id) === String(entry.activeId);
        return `<a href="?catalog=${encodeURIComponent(String(item.id))}" data-id="${item.id}" data-full-name="${escapeCapsuleHtml(item.fullPath || item.name)}" title="${escapeCapsuleHtml(item.fullPath || item.name)}" class="sub-capsule${isActive ? ' is-active' : ''}">${escapeCapsuleHtml(item.name)}</a>`;
      }).join('');
      wrap.classList.remove('hidden');
      if (row) row.classList.remove('hidden');
    }

    // ---- 根目录书签横条：只在“全部”和“收藏夹栏”视图下显示 ----
    function updateRootStripVisibility(catalogId) {
      const strip = document.getElementById('rootStrip');
      if (!strip) return;
      const rootId = strip.getAttribute('data-root-catalog-id');
      const show = !catalogId || String(catalogId) === String(rootId);
      strip.classList.toggle('hidden', !show);
      if (show) updateDockStuckState();
    }

    document.addEventListener('click', async (e) => {
      const link = e.target.closest('a[href^="?catalog="]');
      if (!link) return;

      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

      e.preventDefault();
      const href = link.getAttribute('href');
      const catalogId = link.getAttribute('data-id');
      const catalogName = link.textContent.trim();

      Home.closeSidebarMenu?.();

      const sitesGrid = document.getElementById('sitesGrid');
      if (!sitesGrid) return;

      sitesGrid.style.transition = 'opacity 0.15s ease-out';
      sitesGrid.style.opacity = '0';

      try {
        if (!window.IORI_SITES || !cardController) {
          window.location.href = href;
          return;
        }

        await new Promise(resolve => setTimeout(resolve, 50));

        sitesGrid.style.transition = 'none';
        sitesGrid.style.opacity = '1';

        const filteredSites = cardController.getSitesForCatalog(catalogId);
        cardController.setActiveCatalogId(catalogId);
        cardController.renderSites(filteredSites);
        Home.updateHeading?.(null, catalogId ? catalogName : null, filteredSites.length);
        updateNavigationState(catalogId);

        const config = window.IORI_LAYOUT_CONFIG || {};
        if (config.rememberLastCategory) {
          if (catalogId) {
            localStorage.setItem('iori_last_category', catalogId);
            setCookie('iori_last_category', catalogId, 365);
          } else {
            localStorage.setItem('iori_last_category', 'all');
            setCookie('iori_last_category', 'all', 365);
          }
        }
      } catch (err) {
        console.error('Client-side navigation failed:', err);
      }
    });

    function setCookie(name, value, days) {
      let expires = "";
      if (days) {
        const date = new Date();
        date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
        expires = "; expires=" + date.toUTCString();
      }
      document.cookie = name + "=" + (value || "") + expires + "; path=/; SameSite=Lax";
    }

    function updateNavigationState(catalogId) {
      const allLinks = document.querySelectorAll('a.nav-btn, a.dropdown-item');
      allLinks.forEach(link => {
        const linkId = link.getAttribute('data-id');
        const isActive = (!catalogId && !linkId) || (String(linkId) === String(catalogId));

        if (isActive) {
          link.classList.remove('inactive');
          link.classList.add('active', 'nav-item-active');
        } else {
          link.classList.remove('active', 'nav-item-active');
          link.classList.add('inactive');
        }
        link.dataset.originalClass = link.className;
      });

      if (navContainer) {
        const topWrappers = Array.from(navContainer.children);
        topWrappers.forEach(wrapper => {
          const topLink = wrapper.querySelector(':scope > a.nav-btn');
          if (!topLink) return;

          const topLinkId = topLink.getAttribute('data-id');
          if (String(topLinkId) !== String(catalogId)) {
            const subLink = wrapper.querySelector(`a[data-id="${catalogId}"]`);
            if (subLink) {
              topLink.classList.remove('inactive');
              topLink.classList.add('active', 'nav-item-active');
              topLink.dataset.originalClass = topLink.className;
            }
          }
        });
      }

      if (dropdown && moreBtn) {
        const activeInDropdown = dropdown.querySelector('.active');
        if (activeInDropdown) {
          moreBtn.classList.add('active', 'text-primary-600', 'bg-secondary-100');
          moreBtn.classList.remove('inactive');
        } else {
          moreBtn.classList.remove('active', 'text-primary-600', 'bg-secondary-100');
          moreBtn.classList.add('inactive');
        }
      }

      if (!catalogId) {
        const allBtn = document.querySelector('a[href="?catalog=all"]');
        if (allBtn) {
          allBtn.classList.remove('inactive');
          allBtn.classList.add('active', 'nav-item-active');
        }
      }

      const sidebar = document.getElementById('sidebar');
      if (sidebar) {
        const links = sidebar.querySelectorAll('a[data-id], a[href="?catalog=all"]');
        links.forEach(link => {
          const svg = link.querySelector('svg');
          const linkId = link.getAttribute('data-id');
          const isActive = (!catalogId && !linkId) || (String(linkId) === String(catalogId));

          if (isActive) {
            link.classList.remove('hover:bg-gray-100', 'text-gray-700', 'dark:hover:bg-gray-800', 'dark:text-gray-300');
            link.classList.add('bg-secondary-100', 'text-primary-700', 'dark:bg-gray-800', 'dark:text-primary-400');

            if (svg) {
              svg.classList.remove('text-gray-400', 'dark:text-gray-500');
              svg.classList.add('text-primary-600', 'dark:text-primary-400');
            }
          } else {
            link.classList.remove('bg-secondary-100', 'text-primary-700', 'dark:bg-gray-800', 'dark:text-primary-400');
            link.classList.add('hover:bg-gray-100', 'text-gray-700', 'dark:text-gray-300', 'dark:hover:bg-gray-800');

            if (svg) {
              svg.classList.remove('text-primary-600', 'dark:text-primary-400');
              svg.classList.add('text-gray-400', 'dark:text-gray-500');
            }
          }
        });
      }

      // 侧栏树：当前分类的祖先节点展开，保证高亮项可见
      if (catalogId) expandSidebarAncestors(catalogId);

      // 根目录横条只在“全部”与“收藏夹栏”视图下显示
      updateRootStripVisibility(catalogId);

      // 胶囊形子分类跟着当前分类变
      updateCapsules(catalogId);
    }

    function restoreLastCategory() {
      const config = window.IORI_LAYOUT_CONFIG || {};
      const urlParams = new URLSearchParams(window.location.search);
      const hasCatalogParam = urlParams.has('catalog');

      if (!config.rememberLastCategory || hasCatalogParam || !cardController) return;

      let lastId = localStorage.getItem('iori_last_category');

      if (!lastId) {
        const match = document.cookie.match(/iori_last_category=(all|\d+)/);
        if (match) {
          lastId = match[1];
        }
      }

      if (!lastId) return;

      if (String(lastId) === String(config.ssrCatalogId)) {
        return;
      }

      if (lastId === 'all') {
        const allSites = window.IORI_SITES || [];
        cardController.setActiveCatalogId(null);
        cardController.renderSites(allSites);
        Home.updateHeading?.(null, null, allSites.length);
        updateNavigationState(null);
        return;
      }

      const link = document.querySelector(`a[data-id="${lastId}"]`);

      if (link) {
        const catalogName = link.innerText.trim();
        const filteredSites = cardController.getSitesForCatalog(lastId);

        cardController.setActiveCatalogId(lastId);
        cardController.renderSites(filteredSites);
        Home.updateHeading?.(null, catalogName, filteredSites.length);
        updateNavigationState(lastId);
      } else {
        localStorage.removeItem('iori_last_category');
      }
    }

    Home.updateNavigationState = updateNavigationState;
    initSidebarTree();
    initSidebarMode();
    initSidebarSettings();
    initDockSettings();
    initDockStuckState();
    initSearchToggle();
    restoreLastCategory();
  };
})();
