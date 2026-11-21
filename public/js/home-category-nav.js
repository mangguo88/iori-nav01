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
    restoreLastCategory();
  };
})();
