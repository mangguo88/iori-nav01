import { escapeHTML, sanitizeUrl } from './utils';
import { shortCategoryName } from './menu-renderer';

function getDeviceSetting(settings, device, key, fallback = '') {
  const mobileKey = `mobile_${key}`;
  if (device === 'mobile' && settings[mobileKey] !== undefined) {
    return settings[mobileKey];
  }
  return settings[key] ?? fallback;
}

function getDeviceSettingOrDefault(settings, device, key, fallback = '') {
  const value = getDeviceSetting(settings, device, key, fallback);
  return String(value ?? '').trim() === '' ? fallback : value;
}

export function buildCardTemplateConfig(settings = {}, device = 'desktop') {
  const isMobile = device === 'mobile';
  const cardStyle = getDeviceSetting(settings, device, 'layout_card_style', isMobile ? 'style2' : 'style1') || (isMobile ? 'style2' : 'style1');
  // 条形模式下风格三不再是紧凑导航块：要显示描述/链接行横排成条，所以取消
  // style-3 的强制隐藏与 style-3 class，卡片按风格一的结构渲染、由条形 CSS 排版。
  const stripCards = settings.layout_strip_cards === true;
  const isNavigationTileStyle = cardStyle === 'style3' && !stripCards;
  // 风格二按小舒同学横排卡片：只显示图标+标题+描述两行，不显示分类角标；
  // 描述收到标题下面的 flex-1 里（图标右边），不从卡片左边缘另起一行。
  const isHorizontalTextStyle = cardStyle === 'style2';
  const hideDesc = isNavigationTileStyle || getDeviceSetting(settings, device, 'layout_hide_desc', isMobile) === true;
  const hideLinks = isNavigationTileStyle || getDeviceSetting(settings, device, 'layout_hide_links', isMobile) === true;
  const hideCategory = isHorizontalTextStyle || isNavigationTileStyle || getDeviceSetting(settings, device, 'layout_hide_category', false) === true;
  const enableFrostedGlass = getDeviceSetting(settings, device, 'layout_enable_frosted_glass', false) === true;
  const cardAnimation = getDeviceSetting(settings, device, 'layout_card_animation', 'radial') || 'radial';
  const gridCols = getDeviceSetting(settings, device, 'layout_grid_cols', isMobile ? '3' : '4') || (isMobile ? '3' : '4');
  const hideCopyText = isMobile ? Number(gridCols) >= 3 : (Number(gridCols) || 4) >= 5;
  const titleSize = getDeviceSetting(settings, device, 'card_title_size', isMobile ? '13' : '16') || (isMobile ? '13' : '16');
  const titleColor = getDeviceSetting(settings, device, 'card_title_color', '');
  const titleFont = getDeviceSetting(settings, device, 'card_title_font', '');
  const descSize = getDeviceSetting(settings, device, 'card_desc_size', isMobile ? '11' : '14') || (isMobile ? '11' : '14');
  const descColor = getDeviceSetting(settings, device, 'card_desc_color', '');
  const descFont = getDeviceSetting(settings, device, 'card_desc_font', '');
  const cardRadius = getDeviceSettingOrDefault(settings, device, 'layout_card_border_radius', '12');
  const frostedGlassIntensity = getDeviceSettingOrDefault(settings, device, 'layout_frosted_glass_intensity', '15');

  return {
    device,
    hideDesc,
    hideLinks,
    hideCategory,
    enableFrostedGlass,
    cardStyle,
    // 风格二：描述放进标题下面的 flex-1 里（图标右边），渲染器据此决定描述放哪
    descInTextBlock: isHorizontalTextStyle,
    cardAnimation,
    gridCols,
    hideCopyText,
    titleSize,
    titleColor,
    titleFont,
    descSize,
    descColor,
    descFont,
    cardRadius,
    frostedGlassIntensity,
    aboveFoldImageCount: 8,
    baseCardClass: enableFrostedGlass
      ? 'site-card group h-full flex flex-col overflow-hidden transition-all'
      : 'site-card group h-full flex flex-col bg-white border border-primary-100/60 shadow-sm overflow-hidden dark:bg-gray-800 dark:border-gray-700',
    frostedClass: enableFrostedGlass ? 'frosted-glass-effect' : '',
    cardStyleClass: cardStyle === 'style2' ? 'style-2' : (isNavigationTileStyle ? 'style-3' : (cardStyle === 'style4' ? 'style-4' : '')),
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
}

// 旧数据里存的图标链接有两种是死的：favicon.im（部分网络 403）和
// tc.alex.nyc.mn 的 Telegram 图床链接（该图床已返回 500，库里上千条都是它）。
// 渲染时统一改写成 faviconsnap（项目默认的图标服务），已入库的旧链接不用改库就能恢复。
function domainOf(url) {
  try {
    return new URL(String(url)).hostname || '';
  } catch {
    return '';
  }
}

function normalizeLogoUrl(logo, siteUrl) {
  if (!logo) return logo;
  const faviconIm = String(logo).match(/^https?:\/\/(?:a\.)?favicon\.im\/([^/?#]+)/i);
  if (faviconIm) {
    return `https://faviconsnap.com/api/favicon?url=https://${faviconIm[1]}`;
  }
  if (/^https?:\/\/tc\.alex\.nyc\.mn\//i.test(String(logo))) {
    const domain = domainOf(siteUrl);
    if (domain) return `https://faviconsnap.com/api/favicon?url=https://${domain}`;
    return ''; // 书签网址也解析不出时返回空，渲染成首字母兜底，不显示碎图
  }
  return logo;
}

export function buildCardViewModel(site) {
  const rawName = site?.name || '未命名';
  const normalizedUrl = sanitizeUrl(site?.url);
  const normalizedLogo = normalizeLogoUrl(sanitizeUrl(site?.logo), normalizedUrl);
  const rawCatalog = site?.catelog_name || site?.catelog || '未分类';
  const rawDesc = site?.desc || '暂无描述';

  return {
    id: site?.id,
    catelog_id: site?.catelog_id,
    // 分组视图（?path=）按分类完整路径筛选：保留未转义的原始路径，
    // 前端直接按“等于该路径，或以‘路径 / ’开头”匹配，不用再反转义
    catelog_name: rawCatalog,
    nameHtml: escapeHTML(rawName),
    catalogHtml: escapeHTML(shortCategoryName(rawCatalog)),
    catalogFullHtml: escapeHTML(rawCatalog),
    descHtml: escapeHTML(rawDesc),
    urlHtml: escapeHTML(normalizedUrl),
    displayUrlHtml: escapeHTML(normalizedUrl || '未提供链接'),
    logoUrlHtml: escapeHTML(normalizedLogo),
    cardInitialHtml: escapeHTML((rawName.trim().charAt(0) || '站').toUpperCase()),
    hasValidUrl: Boolean(normalizedUrl),
    hasDesc: Boolean(site?.desc),
    // 移动分组（PUT /api/config/:id）要传全量字段：sort_order、is_private
    // 由 functions/index.js 的 sitesQuery 查出来，不在库里就回落默认值
    sort_order: Number.isFinite(Number(site?.sort_order)) ? Number(site.sort_order) : 9999,
    is_private: site?.is_private ? 1 : 0,
  };
}

export function buildCardHydrationState(sites, settings = {}) {
  return {
    configs: {
      desktop: buildCardTemplateConfig(settings, 'desktop'),
      mobile: buildCardTemplateConfig(settings, 'mobile'),
    },
    cards: (sites || []).map(site => buildCardViewModel(site)),
  };
}
