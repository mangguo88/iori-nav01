(function () {
  const Home = window.IoriHome = window.IoriHome || {};

  function initSidebar() {
    const sidebar = document.getElementById('sidebar');
    const mobileOverlay = document.getElementById('mobileOverlay');
    const sidebarToggle = document.getElementById('sidebarToggle');
    const closeSidebar = document.getElementById('closeSidebar');

    // ---- 窄窗口抽屉：鼠标靠近页面左右边缘自动滑出，移开自动滑回 ----
    // 只在抽屉模式（<1024px）且有鼠标的设备上生效；宽屏侧栏常显，不动它；
    // 触屏没有悬停，抽屉点按行为保持原样。监听从页面加载起就生效，不用刷新。
    // 左边缘 -> 侧栏从左边滑出；右边缘 -> 侧栏从右边滑出（sidebar-right class）。
    const EDGE_ZONE = 24; // 左右边缘触发区宽度 px
    const HIDE_DELAY = 200; // 移开后隐藏延时 ms，防鼠标短暂越界时来回闪
    const finePointer = window.matchMedia('(pointer: fine)');
    const drawerQuery = window.matchMedia('(max-width: 1023px)');
    let hoverOpen = false; // 当前是否由鼠标悬停打开
    let hoverSide = null; // 悬停打开时侧栏在哪边：'left' | 'right' | null
    let hideTimer = null;

    function edgeHoverEnabled() {
      return finePointer.matches && drawerQuery.matches;
    }

    function clearHideTimer() {
      if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
    }

    // 打开前定好边。换边时先把过渡关掉再切：不然 left/right 与 transform 会从旧边
    // 的藏起位置一路过渡到新边（aside 上 transition-all 还会带上 left/right），
    // 侧栏会从屏幕中间横扫进来——只读一次 offsetWidth 强制重排并不能阻止这段
    // 过渡，因为重排只是把样式变化提交了，过渡本身照样从旧值跑到新值。
    // 关掉过渡后，新边的藏起位置瞬间生效（读 offsetWidth 强制重排），再恢复
    // 过渡，之后加 open 才从新边的边缘滑进来。侧栏开着时换边也是瞬间跳到
    // 另一边，不经过中间；侧栏关着时换边，滑出动画的起点永远是屏幕边缘。
    function setSidebarSide(side) {
      if (!sidebar) return;
      if (hoverSide === side) return;
      hoverSide = side;
      const prevTransition = sidebar.style.transition;
      sidebar.style.transition = 'none';
      sidebar.classList.toggle('sidebar-right', side === 'right');
      void sidebar.offsetWidth;
      sidebar.style.transition = prevTransition;
    }

    // 悬停滑出：只给侧栏加 open，不带遮罩、不锁 body 滚动，侧栏浮在内容上面
    // 侧栏藏起时只是移出屏幕、元素没销毁，scrollTop 会一直留着；
    // 打开时先把 scrollTop 清零，滑出来直接看到最上面，不会停在上次的底部。
    function showSidebarHover(side) {
      if (!edgeHoverEnabled()) return;
      clearHideTimer();
      setSidebarSide(side);
      if (hoverOpen) return;
      hoverOpen = true;
      if (sidebar) sidebar.scrollTop = 0;
      sidebar?.classList.add('open');
    }

    // 悬停滑回：延时后收起；点汉堡打开的（遮罩 open）不归这里管。
    // 关掉时不摘 sidebar-right：摘掉会让它瞬间换回左边锚点、再向左滑出，
    // 视觉上就是从右边跳到左边；留着它，下次打开前 setSidebarSide 会按
    // 新边重新算好，滑出方向永远是对的。
    function hideSidebarHover() {
      if (!hoverOpen || hideTimer) return;
      hideTimer = setTimeout(() => {
        hideTimer = null;
        hoverOpen = false;
        hoverSide = null;
        if (!mobileOverlay?.classList.contains('open')) {
          sidebar?.classList.remove('open');
        }
      }, HIDE_DELAY);
    }

    function onQueryChange(query, fn) {
      if (typeof query.addEventListener === 'function') query.addEventListener('change', fn);
      else if (typeof query.addListener === 'function') query.addListener(fn);
    }

    // 窗口从抽屉模式切到宽屏时，悬停打开的状态收回（宽屏侧栏常显，不留多余的 open）；
    // 宽屏下 sidebar-right 的规则不生效，顺手摘掉，下次回窄窗口重新按边算。
    onQueryChange(drawerQuery, () => {
      if (drawerQuery.matches || !hoverOpen) return;
      hoverOpen = false;
      hoverSide = null;
      clearHideTimer();
      if (!mobileOverlay?.classList.contains('open')) {
        sidebar?.classList.remove('open');
      }
      sidebar?.classList.remove('sidebar-right');
    });
    // 指针从鼠标切到触屏时，悬停状态也收回（侧栏本身不动，只清悬停状态）
    onQueryChange(finePointer, () => {
      if (!finePointer.matches) { hoverOpen = false; hoverSide = null; clearHideTimer(); }
    });

    document.addEventListener('mousemove', (e) => {
      if (!edgeHoverEnabled()) return;
      const x = e.clientX;
      const inLeftZone = x <= EDGE_ZONE;
      const inRightZone = x >= window.innerWidth - EDGE_ZONE;
      // 鼠标在侧栏上面时算“没移开”，点分类不会刚移进去就藏回去；
      // 在侧栏上不切边——边只由左右边缘触发决定。
      const overSidebar = !!(sidebar && e.target instanceof Node && sidebar.contains(e.target));
      if (inLeftZone) showSidebarHover('left');
      else if (inRightZone) showSidebarHover('right');
      else if (overSidebar) showSidebarHover(hoverSide || 'left');
      else hideSidebarHover();
    });

    function openSidebar() {
      // 汉堡打开的是左边抽屉：先定到左边（关着时换边要重排一帧，见 setSidebarSide），
      // 再打开；同时先把侧栏自己的 scrollTop 清零，看到最上面。
      setSidebarSide('left');
      if (sidebar) sidebar.scrollTop = 0;
      sidebar?.classList.add('open');
      mobileOverlay?.classList.add('open');
      document.body.style.overflow = 'hidden';
    }

    function closeSidebarMenu() {
      hoverOpen = false;
      hoverSide = null;
      clearHideTimer();
      sidebar?.classList.remove('open');
      mobileOverlay?.classList.remove('open');
      document.body.style.overflow = '';
    }

    sidebarToggle?.addEventListener('click', openSidebar);
    closeSidebar?.addEventListener('click', closeSidebarMenu);
    mobileOverlay?.addEventListener('click', closeSidebarMenu);

    // 侧栏顶部的“回到顶部”：滚到页面顶，手机抽屉里点完顺手收起
    const sidebarBackToTop = document.getElementById('sidebarBackToTop');
    sidebarBackToTop?.addEventListener('click', () => {
      const appScroll = document.getElementById('app-scroll');
      if (appScroll) appScroll.scrollTo({ top: 0, behavior: 'smooth' });
      else window.scrollTo({ top: 0, behavior: 'smooth' });
      closeSidebarMenu();
    });

    return { closeSidebarMenu };
  }

  function showCopySuccess(btn) {
    const successMsg = btn.querySelector('.copy-success');
    if (!successMsg) return;
    successMsg.classList.remove('hidden');
    successMsg.classList.add('copy-success-animation');
    setTimeout(() => {
      successMsg.classList.add('hidden');
      successMsg.classList.remove('copy-success-animation');
    }, 2000);
  }

  function initCopyButtons() {
    const sitesGrid = document.getElementById('sitesGrid');

    sitesGrid?.addEventListener('click', function (e) {
      const btn = e.target.closest('.copy-btn');
      if (!btn) return;

      e.preventDefault();
      e.stopPropagation();
      const url = btn.getAttribute('data-url');
      if (!url) return;

      navigator.clipboard.writeText(url).then(() => {
        showCopySuccess(btn);
      }).catch(() => {
        const textarea = document.createElement('textarea');
        textarea.value = url;
        textarea.style.position = 'fixed';
        document.body.appendChild(textarea);
        textarea.select();
        try {
          document.execCommand('copy');
          showCopySuccess(btn);
        } catch (err) {
          alert('复制失败,请手动复制');
        }
        document.body.removeChild(textarea);
      });
    });
  }

  function initBackToTop() {
    const backToTop = document.getElementById('backToTop');
    const appScroll = document.getElementById('app-scroll');

    let scrollTicking = false;
    const onScroll = () => {
      if (scrollTicking) return;
      scrollTicking = true;
      requestAnimationFrame(() => {
        const top = appScroll ? appScroll.scrollTop : window.pageYOffset;
        if (top > 300) {
          backToTop?.classList.remove('opacity-0', 'invisible');
        } else {
          backToTop?.classList.add('opacity-0', 'invisible');
        }
        scrollTicking = false;
      });
    };

    if (appScroll) {
      appScroll.addEventListener('scroll', onScroll);
    } else {
      window.addEventListener('scroll', onScroll);
    }

    backToTop?.addEventListener('click', function () {
      if (appScroll) {
        appScroll.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  function showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'fixed top-4 right-4 bg-accent-500 text-white px-4 py-2 rounded shadow-lg z-50 transition-opacity duration-300';
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }, 2500);
  }

  function initThemeToggle() {
    const themeToggleBtn = document.getElementById('themeToggleBtn');
    if (!themeToggleBtn) return;

    themeToggleBtn.addEventListener('click', () => {
      const isDark = document.documentElement.classList.contains('dark');
      const nextState = isDark ? 'light' : 'dark';

      const updateTheme = () => {
        if (nextState === 'dark') {
          document.documentElement.classList.add('dark');
        } else {
          document.documentElement.classList.remove('dark');
        }
        localStorage.setItem('theme', nextState);
      };

      if (!document.startViewTransition) {
        updateTheme();
        return;
      }

      document.documentElement.classList.add('theme-animating');

      const transition = document.startViewTransition(() => {
        updateTheme();
      });

      transition.finished.finally(() => {
        document.documentElement.classList.remove('theme-animating');
      });
    });
  }

  Home.initCommonUi = function () {
    const sidebarController = initSidebar();
    Home.closeSidebarMenu = sidebarController.closeSidebarMenu;
    Home.showToast = showToast;

    initCopyButtons();
    initBackToTop();
    initThemeToggle();
  };
})();
