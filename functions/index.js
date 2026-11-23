// functions/index.js
import { isAdminAuthenticated, getHomeCacheKey, clearHomeCacheDirtyIfValue, markHomeCacheDirty, getHomeCacheDirtyValue, getGraphCacheGeneration, writeHomeCacheIfUnchanged } from './_middleware';
import { FONT_MAP } from './constants';
import { escapeHTML, sanitizeUrl, normalizeSortOrder, getStyleStr, sanitizeStyleColor } from './lib/utils';
import { getSettingsKeys, parseSettings } from './lib/settings-parser';
import { renderSidebarTree, renderSidebarBotab, shortCategoryName, buildCategoryPathTree } from './lib/menu-renderer';
import { renderSiteCards, renderEmptyState } from './lib/card-renderer';
import { buildCardHydrationState, buildCardViewModel } from './lib/card-model';
import { ensureSchemaReady } from './lib/schema-migration';
import { resolveWallpaperUrl } from './lib/wallpaper-defaults';

// 模板内容在 Worker 运行时实例生命周期内不变（部署会替换实例），缓存避免每次 MISS 重复 ASSETS.fetch
let cachedTemplateHtml = null;
async function getTemplateHtml(env, requestUrl) {
  if (cachedTemplateHtml !== null) return cachedTemplateHtml;
  const res = await env.ASSETS.fetch(new URL('/index.html', requestUrl));
  cachedTemplateHtml = await res.text();
  return cachedTemplateHtml;
}

function getThemeClasses(isCustomWallpaper) {
  return isCustomWallpaper ? {
    headerClass: 'bg-transparent border-none shadow-none transition-colors duration-300',
    containerClass: 'rounded-2xl',
    titleColorClass: 'text-gray-900 dark:text-gray-100',
    subTextColorClass: 'text-gray-600 dark:text-gray-300',
    searchInputClass: 'bg-white/90 backdrop-blur border border-gray-200 text-gray-800 placeholder-gray-400 focus:ring-primary-200 focus:border-primary-400 focus:bg-white dark:bg-gray-800/90 dark:border-gray-600 dark:text-gray-200 dark:focus:bg-gray-800',
    searchIconClass: 'text-gray-400 dark:text-gray-500',
  } : {
    headerClass: 'bg-primary-700 text-white border-b border-primary-600 shadow-sm dark:bg-gray-900 dark:border-gray-800',
    containerClass: 'rounded-2xl border border-primary-100/60 bg-white/80 backdrop-blur-sm shadow-sm dark:bg-gray-800/80 dark:border-gray-700',
    titleColorClass: 'text-white',
    subTextColorClass: 'text-primary-100/90 dark:text-gray-400',
    searchInputClass: 'bg-white/15 text-white placeholder-primary-200 focus:ring-white/30 focus:bg-white/20 border-none dark:bg-gray-800/50 dark:text-gray-200 dark:placeholder-gray-500',
    searchIconClass: 'text-primary-200 dark:text-gray-500',
  };
}

function normalizeCssPixelValue(value, fallback) {
  const normalized = String(value ?? '').trim().replace(/[^0-9]/g, '');
  if (normalized === '') return String(fallback);
  return normalized;
}

// 透明度设置是 0–100 的整数字符串，转成 CSS 用的 0–1；非法值回落 fallback（默认 1 不透明）
function normalizeOpacityValue(value, fallback) {
  const num = Number(String(value ?? '').trim());
  if (!Number.isFinite(num)) return String(fallback);
  const clamped = Math.min(100, Math.max(0, Math.round(num)));
  return String(clamped / 100);
}

// 主色色板：每档 100–900 八个梯度，供 style.css 覆盖已编译的 accent-* 工具类。
// green 一档与编译进 tailwind.min.css 的 accent 绿完全一致，是默认主色，
// 所以不改设置时首页外观与现在一模一样。
const MAIN_COLOR_SCALES = {
  steelblue: { 100: '#dfe8f0', 200: '#c3d2e0', 300: '#a3b8cc', 400: '#84a0bd', 500: '#6b8cae', 600: '#5b7d9e', 700: '#4a6a8a', 900: '#33475e' },
  orange: { 100: '#ffedd5', 200: '#fed7aa', 300: '#fdba74', 400: '#fb923c', 500: '#f97316', 600: '#ea580c', 700: '#c2410c', 900: '#7c2d12' },
  yellow: { 100: '#fef9c3', 200: '#fef08a', 300: '#fde047', 400: '#facc15', 500: '#eab308', 600: '#ca8a04', 700: '#a16207', 900: '#713f12' },
  green: { 100: '#d9f0e5', 200: '#b4dfcb', 300: '#89caa9', 400: '#61b48a', 500: '#3c976d', 600: '#2e7755', 700: '#265c44', 900: '#1b3e30' },
  cyan: { 100: '#cffafe', 200: '#a5f3fc', 300: '#67e8f9', 400: '#22d3ee', 500: '#06b6d4', 600: '#0891b2', 700: '#0e7490', 900: '#164e63' },
  blue: { 100: '#dbeafe', 200: '#bfdbfe', 300: '#93c5fd', 400: '#60a5fa', 500: '#3b82f6', 600: '#2563eb', 700: '#1d4ed8', 900: '#1e3a8a' },
  purple: { 100: '#ede9fe', 200: '#ddd6fe', 300: '#c4b5fd', 400: '#a78bfa', 500: '#8b5cf6', 600: '#7c3aed', 700: '#6d28d9', 900: '#4c1d95' },
  pink: { 100: '#fce7f3', 200: '#fbcfe8', 300: '#f9a8d4', 400: '#f472b6', 500: '#ec4899', 600: '#db2777', 700: '#be185d', 900: '#831843' },
  red: { 100: '#fee2e2', 200: '#fecaca', 300: '#fca5a5', 400: '#f87171', 500: '#ef4444', 600: '#dc2626', 700: '#b91c1c', 900: '#7f1d1d' },
};

// 模块大小 80–120 的整数字符串，转成 zoom 用的 0.8–1.2；非法值回落 1
function normalizeCardScaleValue(value) {
  const num = Number(String(value ?? '').trim());
  if (!Number.isFinite(num)) return '1';
  return String(Math.min(120, Math.max(80, Math.round(num))) / 100);
}

// 卡片间距 8–24 的整数字符串；非法值回落默认 16
function normalizeCardGapValue(value) {
  const num = Number(String(value ?? '').trim());
  if (!Number.isFinite(num)) return '16';
  return String(Math.min(24, Math.max(8, Math.round(num))));
}

export async function onRequest(context) {
  const { request, env } = context;

  const isAuthenticated = await isAdminAuthenticated(request, env);
  const includePrivate = isAuthenticated ? 1 : 0;

  // === 1. 缓存检查 ===
  const url = new URL(request.url);
  const isHomePage = url.pathname === '/' && !url.search;
  const cacheScope = isAuthenticated ? 'private' : 'public';
  const cookies = request.headers.get('Cookie') || '';
  // 旧版本用这两个 cookie 让前端触发一次缓存刷新，现在没有任何写入路径了；
  // 保留读取分支只为清掉老浏览器里残留的值，可以随下次大版本一起移除。
  const hasLegacyStaleCookie = cookies.includes('iori_cache_stale=1');
  const hasPublicStaleCookie = hasLegacyStaleCookie || cookies.includes('iori_cache_public_stale=1');
  const hasPrivateStaleCookie = hasLegacyStaleCookie || cookies.includes('iori_cache_private_stale=1');
  let shouldClearCookie = false;
  let cacheDirty = false;
  let cacheDirtyValue = null;
  let cacheGeneration = null;

  if (isHomePage) {
    if (isAuthenticated && (hasPublicStaleCookie || hasPrivateStaleCookie)) {
      if (hasPublicStaleCookie && hasPrivateStaleCookie) {
        await markHomeCacheDirty(env, 'all');
      } else if (hasPublicStaleCookie) {
        await markHomeCacheDirty(env, 'public');
      } else {
        await markHomeCacheDirty(env, 'private');
      }
      shouldClearCookie = true;
    }

    // generation 来自 D1，必须在 schema 就绪后读取；KV 只保存按版本隔离的 HTML。
    // 不把 generation 放进 KV，否则冷缓存的负缓存会阻止立即读回新 token。
    let cachedHtml = null;
    try {
      [cacheDirtyValue, cacheGeneration] = await Promise.all([
        getHomeCacheDirtyValue(env, cacheScope),
        ensureSchemaReady(env).then(() => getGraphCacheGeneration(env)),
      ]);
      if (cacheGeneration !== null) {
        cachedHtml = await env.NAV_AUTH.get(getHomeCacheKey(cacheScope, cacheGeneration));
      }
    } catch (e) {
      // 任一读失败都走 MISS 且跳过回填，避免把未知版本或未知 dirty 状态当作 HIT。
      console.warn('Failed to read home cache:', e);
      cachedHtml = null;
      cacheDirtyValue = null;
      cacheGeneration = null;
    }
    cacheDirty = !!cacheDirtyValue;

    if (!cacheDirty && cachedHtml) {
      const response = new Response(cachedHtml, {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': isAuthenticated ? 'private, no-store, max-age=0' : 'public, max-age=0, must-revalidate',
          'X-Cache': 'HIT',
        }
      });

      if (shouldClearCookie) {
        response.headers.append('Set-Cookie', 'iori_cache_stale=; Path=/; Max-Age=0; SameSite=Lax');
        response.headers.append('Set-Cookie', 'iori_cache_public_stale=; Path=/; Max-Age=0; SameSite=Lax');
        response.headers.append('Set-Cookie', 'iori_cache_private_stale=; Path=/; Max-Age=0; SameSite=Lax');
      }

      return response;
    }
  }

  // === 2. 并行执行数据库查询 + 模板获取 ===
  const categoryQuery = isAuthenticated
    ? 'SELECT id, catelog, sort_order, parent_id, is_private FROM category ORDER BY sort_order ASC, id ASC'
    : 'SELECT id, catelog, sort_order, parent_id FROM category WHERE is_private = 0 ORDER BY sort_order ASC, id ASC';

  const settingsKeys = getSettingsKeys();
  const settingsPlaceholders = settingsKeys.map(() => '?').join(',');
  // sort_order、is_private 也要 SELECT 出来：前端移动分组（PUT /api/config/:id）
  // 与拖动排序要用到这两个字段；原来只用于 ORDER BY、不进 SELECT，前端拿不到
  const sitesQuery = `SELECT id, name, url, logo, desc, catelog_id, catelog_name, sort_order, is_private
                      FROM sites WHERE (is_private = 0 OR ? = 1) ORDER BY sort_order ASC, create_time DESC`;

  // Settings 缓存：优先从 KV 读取，减少数据库查询
  const settingsCacheKey = 'settings_cache';
  const fetchSettings = async () => {
    try {
      const cached = await env.NAV_AUTH.get(settingsCacheKey, { type: 'json' });
      if (cached) return { results: cached, fromCache: true };
    } catch (e) {
      console.warn('Settings cache read failed:', e);
    }
    const result = await env.NAV_DB.prepare(`SELECT key, value FROM settings WHERE key IN (${settingsPlaceholders})`).bind(...settingsKeys).all();
    // 异步写入缓存，24h TTL；POST settings 时会主动清除（见 api/settings.js），
    // 较长 TTL 减少 D1 兜底查询次数
    if (result.results && env.NAV_AUTH) {
      context.waitUntil(env.NAV_AUTH.put(settingsCacheKey, JSON.stringify(result.results), { expirationTtl: 86400 }));
    }
    return result;
  };

  const [categoriesResult, settingsResult, sitesResult, templateHtml] = await Promise.all([
    env.NAV_DB.prepare(categoryQuery).all().catch(e => ({ results: [], error: e })),
    fetchSettings().catch(e => ({ results: [], error: e })),
    env.NAV_DB.prepare(sitesQuery).bind(includePrivate).all().catch(e => ({ results: [], error: e })),
    getTemplateHtml(env, request.url)
  ]);

  // === 3. 处理分类结果 — 构建分类树 ===
  let categories = categoriesResult.results || [];
  if (categoriesResult.error) console.error('Failed to fetch categories:', categoriesResult.error);

  const categoryMap = new Map();
  const categoryIdMap = new Map();
  const rootCategories = [];

  categories.forEach(cat => {
    cat.children = [];
    cat.sort_order = normalizeSortOrder(cat.sort_order);
    categoryMap.set(cat.id, cat);
    if (cat.catelog) categoryIdMap.set(cat.catelog, cat.id);
  });

  categories.forEach(cat => {
    if (cat.parent_id && categoryMap.has(cat.parent_id)) {
      categoryMap.get(cat.parent_id).children.push(cat);
    } else {
      rootCategories.push(cat);
    }
  });

  const sortCats = (cats) => {
    cats.sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
    cats.forEach(c => sortCats(c.children));
  };
  sortCats(rootCategories);

  // === 4. 解析设置 ===
  const S = parseSettings(settingsResult.results || settingsResult);

  // === 5. 处理站点结果 ===
  let allSites = sitesResult.results || [];
  if (sitesResult.error) return new Response(`Failed to fetch sites: ${sitesResult.error.message}`, { status: 500 });

  // sites.catelog_name 列基本是空的（历史数据没回填），前端按路径筛选（?path= 分组视图）
  // 与卡片分类角标都靠它；这里按 catelog_id 从分类表反查完整路径补上，列里有值时不动它。
  // 不补的话 IORI_SITES 里绝大多数站点的 catelog_name 都是“未分类”，点 VPS类 这类
  // 分组时站内筛选返回 0 封、卡片区显示“本分类下暂无书签”（服务端 ?path= 按 id 筛所以正常）。
  for (const site of allSites) {
    if (site && !site.catelog_name && site.catelog_id !== null && site.catelog_id !== undefined) {
      const cat = categoryMap.get(site.catelog_id);
      if (cat && cat.catelog) site.catelog_name = cat.catelog;
    }
  }

  function resolveCatalogId(catalogValue, options = {}) {
    const value = String(catalogValue || '').trim();
    if (!value || value.toLowerCase() === 'all') return null;
    if (/^\d+$/.test(value)) {
      const id = Number(value);
      if (categoryMap.has(id)) return id;
    }
    return options.allowName && categoryIdMap.has(value) ? categoryIdMap.get(value) : null;
  }

  // === 6. 确定目标分类 ===
  const requestedCatalogValue = (url.searchParams.get('catalog') || '').trim();
  const requestedPathValue = (url.searchParams.get('path') || '').trim();
  let requestedCatalogId = resolveCatalogId(requestedCatalogValue);

  // 分组视图（?path=）：只在没有明确 ?catalog= 时生效，优先于“默认分类”设置。
  // 路径须是某个分类完整路径的前缀（分组本身或其子文件夹）；同步不给中间文件夹
  // 建分类，所以分组本身没有分类 id，只能按路径匹配它下面全部子分类。
  let requestedGroupPath = null;
  if (requestedCatalogId === null && requestedPathValue) {
    const p = requestedPathValue;
    const isGroupPath = categories.some((c) => {
      const cl = String(c.catelog || '').trim();
      return cl === p || cl.startsWith(p + ' / ');
    });
    if (isGroupPath) requestedGroupPath = p;
  }

  // 共享首页缓存仅基于稳定的默认分类渲染，避免用户的 iori_last_category
  // 影响公共 KV HTML。记住上次分类的恢复逻辑仅在前端执行。
  if (!requestedCatalogValue && !requestedGroupPath) {
    const defaultCat = (S.home_default_category || '').trim();
    requestedCatalogId = resolveCatalogId(defaultCat, { allowName: true });
  }

  let targetCategoryIds = [];
  let currentCatalogName = '';
  const catalogExists = requestedCatalogId !== null;
  const groupPathExists = requestedGroupPath !== null;

  if (catalogExists) {
    const requestedCategory = categoryMap.get(requestedCatalogId);
    currentCatalogName = requestedCategory.catelog;
    targetCategoryIds.push(requestedCatalogId);
  } else if (groupPathExists) {
    currentCatalogName = requestedGroupPath;
    // 分组下全部子分类的 id（含分组本身若它恰好也是一个真实分类）
    for (const c of categories) {
      const cl = String(c.catelog || '').trim();
      if (cl === requestedGroupPath || cl.startsWith(requestedGroupPath + ' / ')) targetCategoryIds.push(c.id);
    }
  }

  const sites = targetCategoryIds.length > 0
    ? allSites.filter(site => targetCategoryIds.includes(site.catelog_id))
    : allSites;

  // === 7. 壁纸处理 ===
  // 主题模式（Meteor / Landscape）自带 CSS 渐变背景；用户没填自定义壁纸时，
  // 主题背景代替风格默认壁纸。填了自定义壁纸的，自定义壁纸优先，主题只换卡片与文字配色。
  const layoutTheme = ['meteor', 'landscape'].includes(S.layout_theme) ? S.layout_theme : 'default';
  const hasCustomWallpaper = Boolean(String(S.layout_custom_wallpaper || '').trim());
  const useThemeBg = layoutTheme !== 'default' && !hasCustomWallpaper;
  const resolvedWallpaperUrl = useThemeBg ? '' : resolveWallpaperUrl(S.layout_custom_wallpaper, S.layout_card_style);
  const isCustomWallpaper = Boolean(resolvedWallpaperUrl);
  // 壁纸模式 = 有壁纸图 或 主题背景：两种情况下头部、分类导航都走透明壁纸样式
  const wallpaperMode = isCustomWallpaper || useThemeBg;
  const themeClass = wallpaperMode ? 'custom-wallpaper' : '';

  // === 8. 计算主题样式 ===
  const themeClasses = getThemeClasses(wallpaperMode);
  const { headerClass, containerClass, titleColorClass, subTextColorClass, searchInputClass, searchIconClass } = themeClasses;

  // === 8b. 构建左侧栏文件夹树（按全路径分段嵌套，见 lib/menu-renderer）===
  const directSiteCounts = new Map();
  for (const site of allSites) {
    const cid = site.catelog_id;
    if (cid === null || cid === undefined) continue;
    directSiteCounts.set(cid, (directSiteCounts.get(cid) || 0) + 1);
  }
  const sidebarCategoryTree = buildCategoryPathTree(categories, directSiteCounts);

  // === 9. 生成菜单 HTML ===
  const allLinkActive = !catalogExists && !groupPathExists;
  const allLinkSidebarClass = allLinkActive
    ? 'sidebar-active-green'
    : 'hover:bg-gray-100 text-gray-700 dark:text-gray-300 dark:hover:bg-gray-800';
  const allLinkSidebarIconClass = allLinkActive ? 'text-primary-600 dark:text-primary-400' : 'text-gray-400 dark:text-gray-500';
  // 顶部横向标签栏已取消显示（2026-11-22 用户要求）：不再渲染横向分类导航，
  // 分类导航只走左侧栏（桌面）与抽屉（手机）。
  const catalogLinkMarkup = renderSidebarTree(sidebarCategoryTree, catalogExists ? requestedCatalogId : null, currentCatalogName);
  const catalogBotabMarkup = renderSidebarBotab(sidebarCategoryTree, currentCatalogName);

  // === 9b. 收藏夹栏根目录书签圆形图标栏（仿 BoTab 圆形图标栏，只学展示形式）===
  // “收藏夹栏根目录、没进任何子文件夹” = catelog 恰好等于“收藏夹栏”那个分类
  // 下的书签（先按名字找到分类，再按 catelog_id 匹配书签，不按名字前缀匹配）。
  // 只在“全部”和“收藏夹栏”两个视图下显示，其它分类视图不显示。
  const rootCategory = categories.find((c) => String(c.catelog || '').trim() === '收藏夹栏') || null;
  const rootCategoryId = rootCategory ? rootCategory.id : null;
  const rootSites = rootCategoryId !== null
    ? allSites.filter((site) => site.catelog_id === rootCategoryId)
    : [];
  const showRootStrip = rootSites.length > 0 && !groupPathExists && (!catalogExists || requestedCatalogId === rootCategoryId);
  const rootStripHtml = showRootStrip ? `
    <div id="rootStrip" class="root-dock" data-root-catalog-id="${rootCategoryId}">
      <div class="root-dock-items">${rootSites.map((site) => {
        const card = buildCardViewModel(site);
        const iconHtml = card.logoUrlHtml
          ? `<img src="${card.logoUrlHtml}" alt="" width="64" height="64" class="root-dock-icon-img" loading="lazy" decoding="async" onerror="this.style.display='none';var f=this.parentElement.querySelector('.root-dock-icon-fallback');if(f){f.style.display='flex';}"><span class="root-dock-icon-fallback" style="display:none;">${card.cardInitialHtml}</span>`
          : `<span class="root-dock-icon-fallback">${card.cardInitialHtml}</span>`;
        return `<a href="${card.urlHtml || '#'}" ${card.hasValidUrl ? 'target="_blank" rel="noopener noreferrer"' : ''} class="root-dock-item" title="${card.nameHtml}"><span class="root-dock-circle">${iconHtml}</span><span class="root-dock-name">${card.nameHtml}</span></a>`;
      }).join('')}</div>
      <button id="dockSettingsBtn" type="button" class="root-dock-settings-btn" title="图标栏设置" aria-label="图标栏设置">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
      </button>
      <div id="dockSettingsPanel" class="root-dock-settings-panel hidden">
        <div class="root-dock-settings-title">图标栏设置</div>
        <div class="root-dock-settings-label">对齐方式</div>
        <div id="dockAlignBtns" class="root-dock-align-btns">
          <button type="button" data-dock-align="left" class="dock-align-btn">居左</button>
          <button type="button" data-dock-align="center" class="dock-align-btn">居中</button>
          <button type="button" data-dock-align="right" class="dock-align-btn">居右</button>
        </div>
        <div class="root-dock-settings-row"><label for="dockSizeRange">图标大小</label><span id="dockSizeValue">64px</span></div>
        <input id="dockSizeRange" type="range" min="48" max="80" step="2" value="64" class="w-full accent-blue-500" aria-label="图标大小">
        <div class="root-dock-settings-row"><label for="dockGapRange">间距</label><span id="dockGapValue">16px</span></div>
        <input id="dockGapRange" type="range" min="8" max="32" step="2" value="16" class="w-full accent-blue-500" aria-label="间距">
        <div class="root-dock-settings-label">字体颜色</div>
        <div id="dockFontColorSwatches" class="root-dock-font-swatches">
          <button type="button" data-dock-font-color="default" class="dock-font-swatch">默认</button>
          <button type="button" data-dock-font-color="white" class="dock-font-swatch">白色</button>
          <button type="button" data-dock-font-color="gray" class="dock-font-swatch">深灰</button>
          <button type="button" data-dock-font-color="blue" class="dock-font-swatch">蓝色</button>
        </div>
      </div>
    </div>` : '';

  // === 9c. 胶囊形子分类（仿 BoTab 标题下那排胶囊，只学展示形式）===
  // 当前分类有子文件夹 → 胶囊就是它的子文件夹（都不选中）；
  // 当前分类是叶子、但有父文件夹 → 胶囊是同级兄弟文件夹，当前这一个变蓝；
  // 全部视图或既无子文件夹又无父文件夹 → 不显示。
  function findTreeNodeWithParent(root, id) {
    const stack = [{ node: root, parent: null }];
    while (stack.length > 0) {
      const { node, parent } = stack.pop();
      if (node.id !== null && node.id !== undefined && String(node.id) === String(id)) return { node, parent };
      for (const child of node.children || []) stack.push({ node: child, parent: node });
    }
    return null;
  }
  // 按完整路径找树节点（分组没有 id，只能按路径找）
  function findTreeNodeByPath(root, fullPath) {
    const stack = [root];
    while (stack.length > 0) {
      const node = stack.pop();
      if (node.fullPath === fullPath) return node;
      for (const child of node.children || []) stack.push(child);
    }
    return null;
  }
  // 锚点分组：当前路径本身是分组（没有 id），或它在某个分组路径之下。
  // 返回离当前路径最近的那个分组节点（没有时返回 null）。
  // 胶囊栏锚定到它：栏里始终是该分组的直接子文件夹，点进子文件夹后栏还是同一组，
  // 不换组、不让其他文件夹消失；栏本身因此也不跳动。
  function findAnchorGroupNode(root, fullPath) {
    const parts = String(fullPath || '').split('/').map((s) => s.trim()).filter(Boolean);
    for (let len = parts.length; len >= 1; len--) {
      const prefix = parts.slice(0, len).join(' / ');
      const node = findTreeNodeByPath(root, prefix);
      if (node && (node.id === null || node.id === undefined)) return node;
    }
    return null;
  }
  // 直接子文件夹：真实分类带 id、子分组带 path，胶囊里都能点；
  // 每项再带一层孙文件夹（children）：胶囊区在该子文件夹后面以“父 - 子”
  // 小一号显示（只展开一层，再深的不用）
  const childCapsuleItems = (node) => (node.children || [])
    .map((c) => ({
      id: (c.id !== null && c.id !== undefined) ? c.id : null,
      path: (c.id !== null && c.id !== undefined) ? null : c.fullPath,
      name: shortCategoryName(c.fullPath),
      fullPath: c.fullPath,
      // 汇总书签数（含子文件夹）：前端点分组筛出 0 封时，靠它判断下面是不是真有书签
      count: Number(c.count) || 0,
      children: (c.children || [])
        .map((g) => ({
          id: (g.id !== null && g.id !== undefined) ? g.id : null,
          path: (g.id !== null && g.id !== undefined) ? null : g.fullPath,
          name: shortCategoryName(g.fullPath),
          fullPath: g.fullPath,
          count: Number(g.count) || 0,
        }))
        .filter((g) => g.id !== null || g.path !== null),
    }))
    .filter((c) => c.id !== null || c.path !== null);
  // 每个分类的胶囊表（供前端站内切换分类时重绘胶囊行；与 SSR 同一套规则）
  const capsuleMap = {};
  const buildCapsuleEntry = (node, parent) => {
    const ownChildren = childCapsuleItems(node);
    if (ownChildren.length > 0) return { items: ownChildren, activeId: null };
    if (parent) {
      const siblings = childCapsuleItems(parent);
      if (siblings.length > 0) return { items: siblings, activeId: node.id };
    }
    return null;
  };
  const collectCapsuleEntries = (node, parent) => {
    if (node.id !== null && node.id !== undefined) {
      const entry = buildCapsuleEntry(node, parent);
      if (entry) capsuleMap[String(node.id)] = entry;
    } else if (node.fullPath) {
      // 没有 id 的分组节点：胶囊是它的直接子文件夹，供 ?path= 分组视图用
      const items = childCapsuleItems(node);
      if (items.length > 0) capsuleMap['path:' + node.fullPath] = { items, activeId: null };
    }
    for (const child of node.children || []) collectCapsuleEntries(child, node);
  };
  collectCapsuleEntries(sidebarCategoryTree, null);
  let subCapsuleEntry = null;
  if (catalogExists) {
    const found = findTreeNodeWithParent(sidebarCategoryTree, requestedCatalogId);
    if (found) {
      // 在某个分组之下时，胶囊锚定到该分组：栏里是分组的直接子文件夹（当前项的兄弟们），
      // 点进子文件夹后栏还是同一组，不换组、不让其他文件夹消失；不在分组之下时走老规则
      const anchor = findAnchorGroupNode(sidebarCategoryTree, found.node.fullPath);
      if (anchor) {
        const items = childCapsuleItems(anchor);
        if (items.length > 0) subCapsuleEntry = { items, activeId: null };
      } else {
        subCapsuleEntry = buildCapsuleEntry(found.node, found.parent);
      }
    }
  } else if (groupPathExists) {
    const groupNode = findTreeNodeByPath(sidebarCategoryTree, requestedGroupPath);
    if (groupNode) {
      const items = childCapsuleItems(groupNode);
      if (items.length > 0) subCapsuleEntry = { items, activeId: null };
    }
  }
  // 胶囊区展示方式（服务端首屏与站内切换共用一套规则）：
  // ① 第一位是当前文件夹本身（大一号药丸，点它回到本级视图）；
  // ② 后面是锚定分组的直接子文件夹（现有规则：点进子文件夹后栏里还是同一组）；
  // 当前文件夹若在子项列表里（它是锚定分组的孩子），它已经是第一位的大药丸，
  // 列表里跳过它、不重复出现；它的孙文件夹紧跟在大药丸后面。
  // ③ 有子文件夹的子文件夹，它的孙文件夹紧跟在它后面、比上一级小一号，
  // 文字写成“父 - 子”（例如“域名 - xyz域名”），只展开一层孙文件夹。
  const renderCapsules = (entry) => {
    if (!entry || !entry.items || entry.items.length === 0) return '';
    // 选中态按完整路径判（当前路径本身，或当前路径在该项之下）：分组子项（没有 id）
    // 也能变蓝/变绿
    const currentPath = String(currentCatalogName || '').trim();
    // 当前文件夹本身的第一位大药丸（分类走 ?catalog=，分组走 ?path=）
    const capsuleLink = (item, extraClass) => {
      const isActive = currentPath !== '' && item.fullPath && (currentPath === item.fullPath || currentPath.startsWith(item.fullPath + ' / '));
      const isGroup = item.id === null || item.id === undefined;
      const href = isGroup
        ? `?path=${encodeURIComponent(item.path)}`
        : `?catalog=${encodeURIComponent(String(item.id))}`;
      const dataAttr = isGroup
        ? `data-path="${escapeHTML(item.path)}" data-count="${Number(item.count) || 0}"`
        : `data-id="${item.id}"`;
      return `<a href="${href}" ${dataAttr} data-full-name="${escapeHTML(item.fullPath)}" title="${escapeHTML(item.fullPath)}" class="sub-capsule${extraClass ? ' ' + extraClass : ''}${isActive ? ' is-active' : ''}">${escapeHTML(item.name)}</a>`;
    };
    // 孙文件夹药丸：比上一级小一号，文字“父 - 子”；当前路径本身就是它时跳过
    // （它已经是第一位的大药丸），当前路径在它之下时照常变蓝
    const grandchildLink = (parent, g) => {
      if (currentPath && g.fullPath === currentPath) return '';
      const isActive = currentPath !== '' && g.fullPath && (currentPath === g.fullPath || currentPath.startsWith(g.fullPath + ' / '));
      const isGroup = g.id === null || g.id === undefined;
      const href = isGroup
        ? `?path=${encodeURIComponent(g.path)}`
        : `?catalog=${encodeURIComponent(String(g.id))}`;
      const dataAttr = isGroup
        ? `data-path="${escapeHTML(g.path)}" data-count="${Number(g.count) || 0}"`
        : `data-id="${g.id}"`;
      return `<a href="${href}" ${dataAttr} data-full-name="${escapeHTML(g.fullPath)}" title="${escapeHTML(g.fullPath)}" class="sub-capsule sub-capsule-grandchild${isActive ? ' is-active' : ''}">${escapeHTML(parent.name + ' - ' + g.name)}</a>`;
    };
    let html = '';
    if (currentPath) {
      const isCurrentGroup = !catalogExists;
      let currentCount = 0;
      if (isCurrentGroup) {
        const currentNode = findTreeNodeByPath(sidebarCategoryTree, currentPath);
        currentCount = currentNode ? (Number(currentNode.count) || 0) : 0;
      }
      const currentItem = {
        id: isCurrentGroup ? null : requestedCatalogId,
        path: isCurrentGroup ? currentPath : null,
        name: shortCategoryName(currentPath),
        fullPath: currentPath,
        count: currentCount,
      };
      html += capsuleLink(currentItem, 'sub-capsule-current');
    }
    // 当前文件夹在子项列表里时，它的孙文件夹紧跟在大药丸后面
    const currentItem = currentPath ? entry.items.find((it) => it.fullPath === currentPath) : null;
    if (currentItem && currentItem.children) {
      for (const g of currentItem.children) html += grandchildLink(currentItem, g);
    }
    for (const item of entry.items) {
      if (currentPath && item.fullPath === currentPath) continue;
      html += capsuleLink(item, '');
      for (const g of (item.children || [])) html += grandchildLink(item, g);
    }
    return html;
  };
  const subCapsulesHtml = `<div id="subCapsules" class="sub-capsules${subCapsuleEntry ? '' : ' hidden'}">${renderCapsules(subCapsuleEntry)}</div>`;

  // === 10. 生成站点卡片 HTML ===
  let sitesGridMarkup = sites.length > 0
    ? renderSiteCards(sites, S)
    : renderEmptyState(categories.length, S.home_hide_admin);

  // === 11. 计算 Grid 列数 ===
  const getMobileGridClass = (cols) => {
    if (cols === '1') return 'grid-cols-1';
    if (cols === '3') return 'grid-cols-3';
    return 'grid-cols-2';
  };
  const getDesktopGridClass = (cols) => {
    // 全局列数三档：单栏=3 列、双栏=5 列、三栏=8 列；4/6/7 是旧值，仍兼容
    if (cols === '3') return 'md:grid-cols-3';
    if (cols === '5') return 'md:grid-cols-3 lg:grid-cols-5';
    if (cols === '6') return 'md:grid-cols-3 lg:grid-cols-5 min-[1200px]:grid-cols-6';
    if (cols === '7') return 'md:grid-cols-3 lg:grid-cols-5 xl:grid-cols-7';
    if (cols === '8') return 'md:grid-cols-3 lg:grid-cols-5 xl:grid-cols-8';
    return 'md:grid-cols-3 lg:grid-cols-4';
  };
  const getCardStyleGridClass = (style, prefix) => {
    if (style === 'style3') return `${prefix}-card-style3`;
    if (style === 'style4') return `${prefix}-card-style4`;
    return style === 'style2' ? `${prefix}-card-style2` : `${prefix}-card-style1`;
  };
  const mobileCardStyleClass = getCardStyleGridClass(S.mobile_layout_card_style, 'mobile');
  const desktopCardStyleClass = getCardStyleGridClass(S.layout_card_style, 'desktop');
  let gridClass = `grid ${getMobileGridClass(S.mobile_layout_grid_cols)} ${getDesktopGridClass(S.layout_grid_cols)} ${mobileCardStyleClass} ${desktopCardStyleClass} gap-3 sm:gap-6 justify-items-center`;

  // === 12. 计算文本和统计信息 ===
  const submissionEnabled = String(env.ENABLE_PUBLIC_SUBMISSION) === 'true';
  const submissionClass = submissionEnabled ? '' : '!hidden';
  const siteName = S.home_site_name || env.SITE_NAME || '灰色轨迹';
  const siteDescription = S.home_site_description || env.SITE_DESCRIPTION || '一个优雅、快速、易于部署的书签（网址）收藏与分享平台，完全基于 Cloudflare 全家桶构建';
  const footerText = S.home_footer_text || env.FOOTER_TEXT || '曾梦想仗剑走天涯';
  const titleStyle = getStyleStr(S.home_title_size, S.home_title_color, S.home_title_font);
  const subtitleStyle = getStyleStr(S.home_subtitle_size, S.home_subtitle_color, S.home_subtitle_font);
  // 统计标题行已整个去掉（2026-11-22 用户要求）：这一行现在只在有胶囊子分类时渲染，
  // 只包胶囊，不再显示“全部收藏 · N 个书签”；没有胶囊时整行不占高度。
  const shouldRenderStatsRow = Boolean(subCapsuleEntry);
  const statsRowPyClass = shouldRenderStatsRow ? 'my-4' : 'hidden';

  // === 13. 搜索引擎选项 ===
  const searchEngineOptions = S.home_search_engine_enabled ? `
    <div class="flex justify-center items-center gap-3 mb-4 text-sm select-none search-engine-wrapper">
        <label class="search-engine-option active" data-engine="local"><span>站内</span></label>
        <label class="search-engine-option" data-engine="google"><span>Google</span></label>
        <label class="search-engine-option" data-engine="baidu"><span>Baidu</span></label>
        <label class="search-engine-option" data-engine="github"><span>Github</span></label>
    </div>` : '';

  // === 14. Header HTML ===
  const safeSiteName = escapeHTML(siteName);
  const safeSiteDesc = escapeHTML(siteDescription);
  const horizontalTitleHtml = S.layout_hide_title ? '' : `<h1 class="text-3xl md:text-4xl font-bold tracking-tight mb-3 ${titleColorClass}" ${titleStyle}>${safeSiteName}</h1>`;
  const horizontalSubtitleHtml = S.layout_hide_subtitle ? '' : `<p class="${subTextColorClass} opacity-90 text-sm md:text-base" ${subtitleStyle}>${safeSiteDesc}</p>`;
  const normalizeCategoryPosition = (position, menuLayout) => {
    if (position === 'above_description') return 'top';
    if (['below_search', 'above_search', 'left', 'top'].includes(position)) return position;
    return menuLayout === 'vertical' ? 'left' : 'below_search';
  };
  const categoryPosition = normalizeCategoryPosition(S.home_category_position, S.layout_menu_layout);
  const isHorizontalCategoryLayout = categoryPosition !== 'left';
  // 顶部横向标签栏已取消显示（2026-11-22 用户要求），横向分类导航的
  // 容器/单行折叠（“更多”下拉）不再渲染；home-category-nav.js 里相关
  // 逻辑已有空值保护（navContainer/moreWrapper 为空时直接跳过），不会报错。

  const verticalHeaderContent = `
    <div class="max-w-4xl mx-auto text-center relative z-10 ${themeClass} py-2">
      <div class="home-title-block mb-3">${horizontalTitleHtml}${horizontalSubtitleHtml}</div>
      <div class="home-search-shell relative max-w-xl mx-auto">
        ${searchEngineOptions}
        <div class="home-search-field relative">
          <input type="search" placeholder="搜索书签..." class="search-input-target w-full pl-12 pr-4 py-3.5 rounded-2xl transition-all shadow-lg outline-none focus:outline-none focus:ring-2 ${searchInputClass}" autocomplete="new-password" autocapitalize="none" autocorrect="off" spellcheck="false" inputmode="search" enterkeyhint="search" aria-label="搜索书签" data-lpignore="true" data-1p-ignore="true" data-bwignore="true" data-form-type="other">
          <svg xmlns="http://www.w3.org/2000/svg" class="home-search-icon h-6 w-6 absolute left-4 top-3.5 ${searchIconClass}" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
        </div>
      </div>
    </div>`;

  const horizontalHeaderContent = `
    <div class="max-w-5xl mx-auto text-center relative z-10 ${themeClass}">
      <div class="home-title-block max-w-4xl mx-auto mb-3">${horizontalTitleHtml}${horizontalSubtitleHtml}</div>
      <div class="home-search-shell relative max-w-xl mx-auto">
        ${searchEngineOptions}
        <div class="home-search-field relative">
          <input id="headerSearchInput" type="search" placeholder="搜索书签..." class="search-input-target w-full pl-12 pr-4 py-3.5 rounded-2xl transition-all shadow-lg outline-none focus:outline-none focus:ring-2 ${searchInputClass}" autocomplete="new-password" autocapitalize="none" autocorrect="off" spellcheck="false" inputmode="search" enterkeyhint="search" aria-label="搜索书签" data-lpignore="true" data-1p-ignore="true" data-bwignore="true" data-form-type="other">
          <svg xmlns="http://www.w3.org/2000/svg" class="home-search-icon h-6 w-6 absolute left-4 top-3.5 ${searchIconClass}" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
        </div>
      </div>
    </div>`;

  // === 15. 布局控制 ===
  // 左侧栏在桌面端默认显示（横排/竖排菜单布局都一样），内容区让出左栏宽度；
  // 桌面端汉堡按钮（label for #sidebar-toggle）可把侧栏收起来，移动端仍是抽屉。
  let sidebarClass = '';
  // 内容区左边距不再写死 lg:ml-64，改由 style.css 里 --sidebar-w 变量联动侧栏宽度
  // （侧栏设置可调宽度，默认 256px；桌面端汉堡收起时仍由 #sidebar-toggle 规则归零）。
  let mainClass = '';
  let sidebarToggleClass = '';
  let mobileToggleVisibilityClass = 'lg:hidden';
  let adminIconHtml = '';
  const themeIconHtml = `
    <button id="themeToggleBtn" class="top-action-icon theme-action-icon" title="切换主题">
      <svg id="themeIconSun" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="block dark:hidden"><circle cx="12" cy="12" r="5"></circle><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"></path></svg>
      <svg id="themeIconMoon" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="hidden dark:block"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>
    </button>`;

  let headerContent = verticalHeaderContent;

  if (isHorizontalCategoryLayout) {
    if (!S.home_hide_admin) {
      adminIconHtml = `
        <a href="/admin" target="_blank" class="top-action-icon admin-action-icon" title="后台管理">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M12 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"/><path d="M7 18a5 5 0 0 1 10 0"/></svg>
        </a>`;
    }

    headerContent = `
      <div class="min-[550px]:hidden">${verticalHeaderContent}</div>
      <div class="hidden min-[550px]:block">${horizontalHeaderContent}</div>`;
  }

  // 搜索栏开关（放大镜）放在右上角按钮组里，紧挨着主题切换按钮；功能不变
  // （点一下收起/展开搜索栏，localStorage 保持），图标栏那行只剩圆和齿轮。
  const searchIconHtml = `
    <button id="searchToggleBtn" type="button" class="top-action-icon search-action-icon" title="隐藏搜索栏" aria-label="显示或隐藏搜索栏" aria-pressed="false">
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/></svg>
    </button>`;
  const topRightActionsHtml = `<div class="fixed top-4 right-4 z-50 flex items-center gap-3">${themeIconHtml}${searchIconHtml}${adminIconHtml}</div>`;
  const leftTopActionHtml = `
    <div id="sidebarToggleWrap" class="fixed top-4 left-4 z-50 ${mobileToggleVisibilityClass}">
      <button id="sidebarToggle" class="p-2 rounded-lg bg-white dark:bg-gray-800 shadow-md hover:bg-gray-100 dark:hover:bg-gray-700">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-primary-500 dark:text-primary-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" /></svg>
      </button>
    </div>`;

  const footerClass = isCustomWallpaper
    ? 'bg-transparent py-8 px-6 mt-12 border-none shadow-none'
    : 'bg-white py-8 px-6 mt-12 border-t border-primary-100 dark:bg-gray-900 dark:border-gray-800';
  // === 16. 模板注入 ===
  let html = templateHtml;

  // --- 收集所有 </head> 注入内容（合并为一次替换） ---
  let headInjections = '';

  // 注入隐藏图标的 CSS
  if (S.home_hide_admin) {
    headInjections += '<style>a[href^="/admin"] { display: none !important; }</style>';
  }

  // 背景层 HTML
  const safeWallpaperUrl = sanitizeUrl(resolvedWallpaperUrl);
  const defaultBgColor = '#fdf8f3';
  let bgLayerHtml = '';
  if (useThemeBg) {
    // 主题背景是纯 CSS 渐变（style.css 里 .theme-bg-meteor / .theme-bg-landscape），不加载图片
    bgLayerHtml = `<div id="fixed-background" class="theme-bg theme-bg-${layoutTheme}" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; z-index: -9999; pointer-events: none; overflow: hidden;"></div>`;
  } else if (safeWallpaperUrl) {
    const blurStyle = S.layout_enable_bg_blur ? `filter: blur(${S.layout_bg_blur_intensity}px); transform: scale(1.02);` : '';
    bgLayerHtml = `<div id="fixed-background" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; z-index: -9999; pointer-events: none; overflow: hidden;"><img src="${safeWallpaperUrl}" alt="" fetchpriority="high" style="width: 100%; height: 100%; object-fit: cover; ${blurStyle}" /></div>`;
  } else {
    bgLayerHtml = `<div id="fixed-background" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; z-index: -9999; pointer-events: none; background-color: ${defaultBgColor};"></div>`;
  }

  // 壁纸预加载
  if (safeWallpaperUrl) {
    headInjections += `<link rel="preload" as="image" href="${safeWallpaperUrl}">\n`;
  }

  // 全局滚动样式
  headInjections += `<style>
    html, body { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; }
    #app-scroll { width: 100%; height: 100%; overflow-y: auto; overflow-x: hidden; -webkit-overflow-scrolling: touch; }
    body { background-color: transparent !important; }
    #fixed-background { transition: background-color 0.3s ease, filter 0.3s ease; }
    @supports (-webkit-touch-callout: none) { #fixed-background { height: -webkit-fill-available; } }
  </style>`;

  // CSS 变量
  const cardRadius = normalizeCssPixelValue(S.layout_card_border_radius, 12);
  const mobileCardRadius = normalizeCssPixelValue(S.mobile_layout_card_border_radius, cardRadius);
  const frostedBlur = normalizeCssPixelValue(S.layout_frosted_glass_intensity, 15);
  const mobileFrostedBlur = normalizeCssPixelValue(S.mobile_layout_frosted_glass_intensity, frostedBlur);
  const cardBgOpacity = normalizeOpacityValue(S.layout_card_bg_opacity, 1);
  const mobileCardBgOpacity = normalizeOpacityValue(S.mobile_layout_card_bg_opacity, cardBgOpacity);
  const mainColorScale = MAIN_COLOR_SCALES[S.layout_main_color] || MAIN_COLOR_SCALES.green;
  const mainColorVars = Object.entries(mainColorScale).map(([step, hex]) => `--main-${step}: ${hex};`).join(' ');
  const cardScale = normalizeCardScaleValue(S.layout_card_scale);
  // 桌面网格列数：细指针（鼠标）下窗口缩窄也不切移动列数，style.css 里
  // @media (pointer: fine) 的 #sitesGrid 规则按这个变量强制列数。
  const desktopGridCols = ['3', '5', '6', '7', '8'].includes(String(S.layout_grid_cols)) ? Number(S.layout_grid_cols) : 4;
  // 顶栏壁纸底：把壁纸 URL 也写进 :root 变量，style.css 里 sticky 的 header 用
  // background-attachment: fixed 引用它，跟 #fixed-background 的 img 严丝合缝。
  // safeWallpaperUrl 经 sanitizeUrl 只剩 http(s) 绝对地址，不含裸双引号，可安全放进 url("...")。
  const wallpaperUrlVar = safeWallpaperUrl ? ` --wallpaper-url: url("${safeWallpaperUrl}");` : '';
  headInjections += `<style>:root { --card-padding: 1.25rem; --card-radius: ${cardRadius}px; --frosted-glass-blur: ${frostedBlur}px; --card-bg-opacity: ${cardBgOpacity}; --desktop-grid-cols: ${desktopGridCols}; ${mainColorVars} --card-scale: ${cardScale};${wallpaperUrlVar} }@media (max-width: 767px) { :root { --card-radius: ${mobileCardRadius}px; --frosted-glass-blur: ${mobileFrostedBlur}px; --card-bg-opacity: ${mobileCardBgOpacity}; } }</style>`;
  // 卡片间距只在用户改过默认值（16）时才注入：不改时沿用现有的 gap-3/sm:gap-6
  // 与风格三 15px，首页外观与现在一模一样。
  const cardGap = normalizeCardGapValue(S.layout_card_gap);
  if (cardGap !== '16') {
    headInjections += `<style>#sitesGrid { gap: ${cardGap}px !important; }</style>`;
  }

  // 自定义字体
  const usedFonts = new Set();
  if (!S.layout_hide_title && S.home_title_font) usedFonts.add(S.home_title_font);
  if (!S.layout_hide_subtitle && S.home_subtitle_font) usedFonts.add(S.home_subtitle_font);
  if (S.card_title_font) usedFonts.add(S.card_title_font);
  if (S.card_desc_font) usedFonts.add(S.card_desc_font);
  if (S.mobile_card_title_font) usedFonts.add(S.mobile_card_title_font);
  if (S.mobile_card_desc_font) usedFonts.add(S.mobile_card_desc_font);

  let fontLinksHtml = '';
  let needsFontPreconnect = false;
  usedFonts.forEach(font => {
    if (font && FONT_MAP[font]) {
      fontLinksHtml += `<link rel="stylesheet" href="${FONT_MAP[font]}">`;
      needsFontPreconnect = true;
    }
  });
  const safeCustomFontUrl = sanitizeUrl(S.home_custom_font_url);
  if (safeCustomFontUrl) fontLinksHtml += `<link rel="stylesheet" href="${safeCustomFontUrl}">`;
  // 字体域名预连接（减少 DNS + TLS 延迟）
  if (needsFontPreconnect) headInjections += `<link rel="preconnect" href="https://fonts.loli.net" crossorigin>`;
  if (safeCustomFontUrl) {
    try {
      const customFontOrigin = new URL(safeCustomFontUrl).origin;
      if (customFontOrigin !== 'https://fonts.loli.net') {
        headInjections += `<link rel="preconnect" href="${escapeHTML(customFontOrigin)}" crossorigin>`;
      }
    } catch { /* sanitizeUrl 已校验，这里不会触达 */ }
  }
  // Logo 图标服务域名预连接（首屏 logo 多数来自 ICON_API 域，提前握手减少 LCP）
  if (env.ICON_API) {
    try {
      const iconOrigin = new URL(env.ICON_API).origin;
      headInjections += `<link rel="preconnect" href="${escapeHTML(iconOrigin)}" crossorigin>`;
    } catch { /* ICON_API 格式异常时静默跳过 */ }
  }
  if (fontLinksHtml) headInjections += fontLinksHtml;

  // 卡片自定义字体 CSS
  let customCardCss = '';
  const desktopCardTitleStyle = getStyleStr(S.card_title_size, S.card_title_color, S.card_title_font).replace('style="', '').replace('"', '');
  const mobileCardTitleStyle = getStyleStr(S.mobile_card_title_size, S.mobile_card_title_color, S.mobile_card_title_font).replace('style="', '').replace('"', '');
  const desktopCardTitleColor = sanitizeStyleColor(S.card_title_color);
  const mobileCardTitleColor = sanitizeStyleColor(S.mobile_card_title_color);
  const desktopCardDescStyle = getStyleStr(S.card_desc_size, S.card_desc_color, S.card_desc_font).replace('style="', '').replace('"', '');
  const mobileCardDescStyle = getStyleStr(S.mobile_card_desc_size, S.mobile_card_desc_color, S.mobile_card_desc_font).replace('style="', '').replace('"', '');
  if (desktopCardTitleStyle || mobileCardTitleStyle) {
    if (desktopCardTitleStyle) customCardCss += `@media (min-width: 768px) { .site-title { ${desktopCardTitleStyle} } }`;
    if (mobileCardTitleStyle) customCardCss += `@media (max-width: 767px) { .site-title { ${mobileCardTitleStyle} } }`;
  }
  if (desktopCardTitleColor) customCardCss += `@media (min-width: 768px) { body { --desktop-card-title-color: ${desktopCardTitleColor}; } }`;
  if (mobileCardTitleColor) customCardCss += `@media (max-width: 767px) { body { --mobile-card-title-color: ${mobileCardTitleColor}; } }`;
  if (desktopCardDescStyle || mobileCardDescStyle) {
    if (desktopCardDescStyle) customCardCss += `@media (min-width: 768px) { .site-card p { ${desktopCardDescStyle} } }`;
    if (mobileCardDescStyle) customCardCss += `@media (max-width: 767px) { .site-card p { ${mobileCardDescStyle} } }`;
  }
  if (customCardCss) headInjections += `<style>${customCardCss}</style>`;

  // 全局站点卡片视图模型与布局配置：直接序列化后注入到 main.js 之前
  const cardHydrationState = buildCardHydrationState(allSites, S);
  const safeSitesJson = JSON.stringify(cardHydrationState.cards).replace(/</g, '\\u003c');
  // 只注入设备维度的 configs；重复的 config 字段已移除。
  const safeCardConfigsJson = JSON.stringify(cardHydrationState.configs).replace(/</g, '\\u003c');
  const safeLayoutConfigJson = JSON.stringify({
    hideDesc: S.layout_hide_desc,
    hideLinks: S.layout_hide_links,
    hideCategory: S.layout_hide_category,
    gridCols: S.layout_grid_cols,
    cardStyle: S.layout_card_style,
    cardAnimation: S.layout_card_animation,
    enableFrostedGlass: S.layout_enable_frosted_glass,
    rememberLastCategory: S.home_remember_last_category,
    // 当前 SSR 已渲染的分类（用于前端 Auto-restore 判断是否可跳过重绘）
    ssrCatalogId: catalogExists ? requestedCatalogId : 'all',
    // 当前 SSR 已渲染的分组完整路径（?path= 分组视图；没有时为 null）
    ssrPath: groupPathExists ? requestedGroupPath : null,
  }).replace(/</g, '\\u003c');

  // --- 一次性替换 </head> ---
  html = html.replace('</head>', headInjections + '</head>');

  // 替换 body 标签 + 滚动容器
  const pageStyleClasses = [
    S.layout_card_style === 'style3' ? 'desktop-page-style3' : '',
    S.mobile_layout_card_style === 'style3' ? 'mobile-page-style3' : '',
    `category-pos-${categoryPosition}`,
    layoutTheme !== 'default' ? `theme-${layoutTheme}` : '',
    S.layout_strip_cards ? 'strip-cards' : '',
  ].filter(Boolean).join(' ');
  html = html.replace(
    '<body class="bg-secondary-50 font-sans text-gray-800">',
    `<body class="bg-secondary-50 dark:bg-gray-900 font-sans text-gray-800 dark:text-gray-100 relative ${wallpaperMode ? 'custom-wallpaper' : ''} ${pageStyleClasses}">${bgLayerHtml}<div id="app-scroll">`
  );
  html = html.replace('</body>', '</div></body>');

  // 将 IORI_SITES / IORI_LAYOUT_CONFIG 数据注入到 main.js 之前，使其在 body 底部而非 <head>，加快 FCP
  // - 字面量匹配：避免未来模板给 <script> 加 defer/type 等属性时正则静默失配
  // - 函数形式 replacement：规避用户数据中可能含 $&、$1 等被当作 back-reference
  const mainJsMarker = '<script src="/js/main.js';
  const safeCapsulesJson = JSON.stringify(capsuleMap).replace(/</g, '\\u003c');
  if (!html.includes(mainJsMarker)) {
    console.error('Card hydration injection skipped: main.js marker not found in template');
  } else {
    html = html.replace(
      mainJsMarker,
      () => `<script>window.IORI_SITES=${safeSitesJson};window.IORI_CARD_CONFIGS=${safeCardConfigsJson};window.IORI_LAYOUT_CONFIG=${safeLayoutConfigJson};window.IORI_CAPSULES=${safeCapsulesJson};</script>\n  ${mainJsMarker}`
    );
  }

  // 替换所有模板占位符（单次正则匹配 + 映射表）
  const canonicalUrl = `${url.origin}/`;
  const ogImageUrl = `${url.origin}/favicon.svg`;
  const replacements = {
    'HEADER_CONTENT': headerContent,
    'HEADER_CLASS': headerClass,
    'CONTAINER_CLASS': containerClass,
    'FOOTER_CLASS': footerClass,
    'LEFT_TOP_ACTION': leftTopActionHtml,
    'RIGHT_TOP_ACTION': topRightActionsHtml,
    'SITE_NAME': escapeHTML(siteName),
    'SITE_DESCRIPTION': escapeHTML(siteDescription),
    'CANONICAL_URL': escapeHTML(canonicalUrl),
    'OG_IMAGE_URL': escapeHTML(ogImageUrl),
    'FOOTER_TEXT': escapeHTML(footerText),
    'CATALOG_LINKS': catalogLinkMarkup,
    'CATALOG_LINKS_BOTAB': catalogBotabMarkup,
    'ROOT_STRIP': rootStripHtml,
    'SUB_CAPSULES': subCapsulesHtml,
    'SUBMISSION_CLASS': submissionClass,
    'TOTAL_SITES': String(allSites.length),
    'ALL_LINK_CLASS': allLinkSidebarClass,
    'ALL_LINK_ICON_CLASS': allLinkSidebarIconClass,
    'STATS_ROW_PY_CLASS': statsRowPyClass,
    'SITES_GRID': sitesGridMarkup,
    'CURRENT_YEAR': String(new Date().getFullYear()),
    'SIDEBAR_CLASS': sidebarClass,
    'MAIN_CLASS': mainClass,
    'SIDEBAR_TOGGLE_CLASS': sidebarToggleClass,
  };
  html = html.replace(/\{\{(\w+)\}\}/g, (_, key) => replacements[key] ?? '');
  html = html.replace('grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6', gridClass);

  // 压缩标签间空白，减小 HTML 体积（项目无 <pre>/<textarea>，安全）
  html = html.replace(/>\s+</g, '><');

  // === 17. 返回响应 ===
  const response = new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': isAuthenticated ? 'private, no-store, max-age=0' : 'public, max-age=0, must-revalidate',
    }
  });

  if (shouldClearCookie) {
    response.headers.append('Set-Cookie', 'iori_cache_stale=; Path=/; Max-Age=0; SameSite=Lax');
    response.headers.append('Set-Cookie', 'iori_cache_public_stale=; Path=/; Max-Age=0; SameSite=Lax');
    response.headers.append('Set-Cookie', 'iori_cache_private_stale=; Path=/; Max-Age=0; SameSite=Lax');
  }

  if (isHomePage && cacheGeneration !== null) {
    context.waitUntil((async () => {
      try {
        const wrote = await writeHomeCacheIfUnchanged(env, cacheScope, html, cacheGeneration);
        if (wrote && cacheDirty) {
          // 条件清除：渲染期间若有新写入刷新了标记，保留它让下一次请求重新渲染。
          await clearHomeCacheDirtyIfValue(env, cacheScope, cacheDirtyValue);
        }
      } catch (e) {
        console.warn('Failed to update home cache:', e);
      }
    })());
  }

  return response;
}
