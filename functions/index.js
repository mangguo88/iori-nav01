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
  let requestedCatalogId = resolveCatalogId(requestedCatalogValue);

  // 共享首页缓存仅基于稳定的默认分类渲染，避免用户的 iori_last_category
  // 影响公共 KV HTML。记住上次分类的恢复逻辑仅在前端执行。
  if (!requestedCatalogValue) {
    const defaultCat = (S.home_default_category || '').trim();
    requestedCatalogId = resolveCatalogId(defaultCat, { allowName: true });
  }

  let targetCategoryIds = [];
  let currentCatalogName = '';
  const catalogExists = requestedCatalogId !== null;

  if (catalogExists) {
    const requestedCategory = categoryMap.get(requestedCatalogId);
    currentCatalogName = requestedCategory.catelog;
    targetCategoryIds.push(requestedCatalogId);
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
  const allLinkActive = !catalogExists;
  const allLinkSidebarClass = allLinkActive
    ? 'bg-secondary-100 text-primary-700 dark:bg-gray-800 dark:text-primary-400'
    : 'hover:bg-gray-100 text-gray-700 dark:text-gray-300 dark:hover:bg-gray-800';
  const allLinkSidebarIconClass = allLinkActive ? 'text-primary-600 dark:text-primary-400' : 'text-gray-400 dark:text-gray-500';
  // 顶部横向标签栏已取消显示（2026-11-22 用户要求）：不再渲染横向分类导航，
  // 分类导航只走左侧栏（桌面）与抽屉（手机）。
  const catalogLinkMarkup = renderSidebarTree(sidebarCategoryTree, catalogExists ? requestedCatalogId : null);
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
  const showRootStrip = rootSites.length > 0 && (!catalogExists || requestedCatalogId === rootCategoryId);
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
  const childCapsuleItems = (node) => (node.children || [])
    .filter((c) => c.id !== null && c.id !== undefined)
    .map((c) => ({ id: c.id, name: shortCategoryName(c.fullPath), fullPath: c.fullPath }));
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
    }
    for (const child of node.children || []) collectCapsuleEntries(child, node);
  };
  collectCapsuleEntries(sidebarCategoryTree, null);
  let subCapsuleEntry = null;
  if (catalogExists) {
    const found = findTreeNodeWithParent(sidebarCategoryTree, requestedCatalogId);
    if (found) subCapsuleEntry = buildCapsuleEntry(found.node, found.parent);
  }
  const renderCapsules = (entry) => {
    if (!entry || !entry.items || entry.items.length === 0) return '';
    return entry.items.map((item) => {
      const isActive = entry.activeId !== null && entry.activeId !== undefined && String(item.id) === String(entry.activeId);
      return `<a href="?catalog=${encodeURIComponent(String(item.id))}" data-id="${item.id}" data-full-name="${escapeHTML(item.fullPath)}" title="${escapeHTML(item.fullPath)}" class="sub-capsule${isActive ? ' is-active' : ''}">${escapeHTML(item.name)}</a>`;
    }).join('');
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
  // 标题栏的当前分类只显示短名（如 "vps服务器"），完整路径在侧栏/导航的 title 提示里
  const headingCatalogShort = currentCatalogName ? shortCategoryName(currentCatalogName) : '';
  const headingPlainText = currentCatalogName ? `${headingCatalogShort} · ${sites.length} 个书签` : `全部收藏 · ${sites.length} 个书签`;
  const headingText = escapeHTML(headingPlainText);
  const headingDefaultAttr = escapeHTML(headingPlainText);
  const headingActiveAttr = catalogExists ? escapeHTML(headingCatalogShort) : '';
  const submissionEnabled = String(env.ENABLE_PUBLIC_SUBMISSION) === 'true';
  const submissionClass = submissionEnabled ? '' : '!hidden';
  const siteName = S.home_site_name || env.SITE_NAME || '灰色轨迹';
  const siteDescription = S.home_site_description || env.SITE_DESCRIPTION || '一个优雅、快速、易于部署的书签（网址）收藏与分享平台，完全基于 Cloudflare 全家桶构建';
  const footerText = S.home_footer_text || env.FOOTER_TEXT || '曾梦想仗剑走天涯';
  const titleStyle = getStyleStr(S.home_title_size, S.home_title_color, S.home_title_font);
  const subtitleStyle = getStyleStr(S.home_subtitle_size, S.home_subtitle_color, S.home_subtitle_font);
  const statsStyle = getStyleStr(S.home_stats_size, S.home_stats_color, S.home_stats_font);
  const hitokotoStyle = getStyleStr(S.home_hitokoto_size, S.home_hitokoto_color, S.home_hitokoto_font);
  const hitokotoContent = S.home_hide_hitokoto ? '' : '疏影横斜水清浅,暗香浮动月黄昏。';
  const shouldRenderStatsRow = !S.home_hide_stats || !S.home_hide_hitokoto;
  const statsRowPyClass = shouldRenderStatsRow ? 'my-8' : 'hidden';
  const statsRowHiddenClass = shouldRenderStatsRow ? '' : 'hidden';

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
    <div class="max-w-4xl mx-auto text-center relative z-10 ${themeClass} py-8">
      <div class="home-title-block mb-8">${horizontalTitleHtml}${horizontalSubtitleHtml}</div>
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
      <div class="home-title-block max-w-4xl mx-auto mb-8">${horizontalTitleHtml}${horizontalSubtitleHtml}</div>
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

  const topRightActionsHtml = `<div class="fixed top-4 right-4 z-50 flex items-center gap-3">${themeIconHtml}${adminIconHtml}</div>`;
  const leftTopActionHtml = `
    <div class="fixed top-4 left-4 z-50 ${mobileToggleVisibilityClass}">
      <button id="sidebarToggle" class="p-2 rounded-lg bg-white dark:bg-gray-800 shadow-md hover:bg-gray-100 dark:hover:bg-gray-700">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-primary-500 dark:text-primary-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" /></svg>
      </button>
    </div>`;

  const footerClass = isCustomWallpaper
    ? 'bg-transparent py-8 px-6 mt-12 border-none shadow-none'
    : 'bg-white py-8 px-6 mt-12 border-t border-primary-100 dark:bg-gray-900 dark:border-gray-800';
  const hitokotoClass = (isCustomWallpaper ? 'text-black dark:text-gray-200' : 'text-gray-500 dark:text-gray-400') + ' ml-auto';

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
  headInjections += `<style>:root { --card-padding: 1.25rem; --card-radius: ${cardRadius}px; --frosted-glass-blur: ${frostedBlur}px; --card-bg-opacity: ${cardBgOpacity}; ${mainColorVars} --card-scale: ${cardScale}; }@media (max-width: 767px) { :root { --card-radius: ${mobileCardRadius}px; --frosted-glass-blur: ${mobileFrostedBlur}px; --card-bg-opacity: ${mobileCardBgOpacity}; } }</style>`;
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
  if (!S.home_hide_stats && S.home_stats_font) usedFonts.add(S.home_stats_font);
  if (!S.home_hide_hitokoto && S.home_hitokoto_font) usedFonts.add(S.home_hitokoto_font);
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
    'HITOKOTO_CLASS': hitokotoClass,
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
    'HEADING_TEXT': headingText,
    'HEADING_DEFAULT': headingDefaultAttr,
    'HEADING_ACTIVE': headingActiveAttr,
    'TOTAL_SITES': String(allSites.length),
    'ALL_LINK_CLASS': allLinkSidebarClass,
    'ALL_LINK_ICON_CLASS': allLinkSidebarIconClass,
    'STATS_VISIBLE': S.home_hide_stats ? 'hidden' : '',
    'STATS_STYLE': statsStyle,
    'HITOKOTO_VISIBLE': S.home_hide_hitokoto ? 'hidden' : '',
    'STATS_ROW_PY_CLASS': statsRowPyClass,
    'STATS_ROW_HIDDEN': statsRowHiddenClass,
    'HITOKOTO_CONTENT': hitokotoContent,
    'HITOKOTO_STYLE': hitokotoStyle,
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
