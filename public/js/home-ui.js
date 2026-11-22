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
    const EDGE_ZONE = 24; // 左右边缘触发区宽度 px
    const HIDE_DELAY = 200; // 移开后隐藏延时 ms，防鼠标短暂越界时来回闪
    const finePointer = window.matchMedia('(pointer: fine)');
    const drawerQuery = window.matchMedia('(max-width: 1023px)');
    let hoverOpen = false; // 当前是否由鼠标悬停打开
    let hideTimer = null;

    function edgeHoverEnabled() {
      return finePointer.matches && drawerQuery.matches;
    }

    function clearHideTimer() {
      if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
    }

    // 悬停滑出：只给侧栏加 open，不带遮罩、不锁 body 滚动，侧栏浮在内容上面
    function showSidebarHover() {
      if (!edgeHoverEnabled()) return;
      clearHideTimer();
      if (hoverOpen) return;
      hoverOpen = true;
      sidebar?.classList.add('open');
    }

    // 悬停滑回：延时后收起；点汉堡打开的（遮罩 open）不归这里管
    function hideSidebarHover() {
      if (!hoverOpen || hideTimer) return;
      hideTimer = setTimeout(() => {
        hideTimer = null;
        hoverOpen = false;
        if (!mobileOverlay?.classList.contains('open')) {
          sidebar?.classList.remove('open');
        }
      }, HIDE_DELAY);
    }

    function onQueryChange(query, fn) {
      if (typeof query.addEventListener === 'function') query.addEventListener('change', fn);
      else if (typeof query.addListener === 'function') query.addListener(fn);
    }

    // 窗口从抽屉模式切到宽屏时，悬停打开的状态收回（宽屏侧栏常显，不留多余的 open）
    onQueryChange(drawerQuery, () => {
      if (drawerQuery.matches || !hoverOpen) return;
      hoverOpen = false;
      clearHideTimer();
      if (!mobileOverlay?.classList.contains('open')) {
        sidebar?.classList.remove('open');
      }
    });
    // 指针从鼠标切到触屏时，悬停状态也收回
    onQueryChange(finePointer, () => {
      if (!finePointer.matches) { hoverOpen = false; clearHideTimer(); }
    });

    document.addEventListener('mousemove', (e) => {
      if (!edgeHoverEnabled()) return;
      const x = e.clientX;
      const inEdgeZone = x <= EDGE_ZONE || x >= window.innerWidth - EDGE_ZONE;
      // 鼠标在侧栏上面时算“没移开”，点分类不会刚移进去就藏回去
      const overSidebar = !!(sidebar && e.target instanceof Node && sidebar.contains(e.target));
      if (inEdgeZone || overSidebar) showSidebarHover();
      else hideSidebarHover();
    });

    function openSidebar() {
      sidebar?.classList.add('open');
      mobileOverlay?.classList.add('open');
      document.body.style.overflow = 'hidden';
    }

    function closeSidebarMenu() {
      hoverOpen = false;
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
