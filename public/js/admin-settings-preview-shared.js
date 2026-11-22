(function () {
  const ns = window.AdminSettings = window.AdminSettings || {};

 const FONT_OPTIONS = [
    { value: "", label: "默认字体" },
    { value: "sans-serif", label: "Sans Serif (通用无衬线)" },
    { value: "serif", label: "Serif (通用衬线)" },
    { value: "monospace", label: "Monospace (通用等宽)" },
    { value: "'Microsoft YaHei', sans-serif", label: "微软雅黑 (Windows)" },
    { value: "'SimSun', serif", label: "宋体 (Windows)" },
    { value: "'PingFang SC', sans-serif", label: "苹方 (Mac)" },
    { value: "'Segoe UI', sans-serif", label: "Segoe UI (Windows)" },
    { value: "'Noto Sans SC', sans-serif", label: "Noto Sans SC (Web)" },
    { value: "'Noto Serif SC', serif", label: "Noto Serif SC (Web)" },
    { value: "'Ma Shan Zheng', cursive", label: "马善政毛笔 (Web)" },
    { value: "'ZCOOL KuaiLe', cursive", label: "站酷快乐体 (Web)" },
    { value: "'Long Cang', cursive", label: "龙苍草书 (Web)" },
    { value: "'Roboto', sans-serif", label: "Roboto (Web)" },
    { value: "'Open Sans', sans-serif", label: "Open Sans (Web)" },
    { value: "'Lato', sans-serif", label: "Lato (Web)" },
    { value: "'Montserrat', sans-serif", label: "Montserrat (Web)" }
  ];

 const FONT_URL_MAP = {
    "'Noto Sans SC', sans-serif": "https://fonts.loli.net/css2?family=Noto+Sans+SC:wght@300;400;500;700&display=swap",
    "'Noto Serif SC', serif": "https://fonts.loli.net/css2?family=Noto+Serif+SC:wght@400;700&display=swap",
    "'Ma Shan Zheng', cursive": "https://fonts.loli.net/css2?family=Ma+Shan+Zheng&display=swap",
    "'ZCOOL KuaiLe', cursive": "https://fonts.loli.net/css2?family=ZCOOL+KuaiLe&display=swap",
    "'Long Cang', cursive": "https://fonts.loli.net/css2?family=Long+Cang&display=swap",
    "'Roboto', sans-serif": "https://fonts.loli.net/css2?family=Roboto:wght@300;400;500;700&display=swap",
    "'Open Sans', sans-serif": "https://fonts.loli.net/css2?family=Open+Sans:wght@400;600;700&display=swap",
    "'Lato', sans-serif": "https://fonts.loli.net/css2?family=Lato:wght@400;700&display=swap",
    "'Montserrat', sans-serif": "https://fonts.loli.net/css2?family=Montserrat:wght@400;700&display=swap"
  };

const loadedFonts = new Set();

// 主色 9 档色板：与 functions/index.js 里 MAIN_COLOR_SCALES 同一份值，
// 首页用它生成 --main-* 变量；预览用它把主色实时画到预览根上。
// 改色板时两边要一起改。
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

 function escapeHTML(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

 function getRadioValue(radios, fallback) {
    for (const radio of radios || []) {
      if (radio.checked) return radio.value;
    }
    return fallback;
  }

 function normalizeCategoryPosition(position, menuLayout) {
    if (position === 'above_description') return 'top';
    if (['below_search', 'above_search', 'left', 'top'].includes(position)) return position;
    return menuLayout === 'vertical' ? 'left' : 'below_search';
  }

 function getPreviewInputValue(input, fallback = '') {
    return input ? input.value.trim() : fallback;
  }

 function getPreviewInputValueOrDefault(input, fallback, defaultValue) {
    const value = getPreviewInputValue(input, fallback);
    return value || defaultValue;
  }

 function getPreviewNumberOrDefault(value, defaultValue) {
    const text = String(value ?? '').trim();
    if (text === '') return defaultValue;
    const number = Number(text);
    return Number.isFinite(number) ? number : defaultValue;
  }

 function shouldHideCopyTextForPreview(device, gridCols) {
    return device === 'mobile'
      ? Number(gridCols) >= 3
      : (Number(gridCols) || 4) >= 5;
  }

 function normalizePreviewUrl(value) {
    const text = String(value ?? '').trim();
    if (!text) return '';
    try {
      const parsed = new URL(text);
      return (parsed.protocol === 'http:' || parsed.protocol === 'https:') ? parsed.href : '';
    } catch {
      return '';
    }
  }

 function normalizePreviewAssetUrl(value) {
    if (typeof window.normalizeUrl === 'function') {
      return window.normalizeUrl(value);
    }

    const text = String(value ?? '').trim();
    if (!text) return '';
    if (/^data:image\/[\w+.-]+;base64,/.test(text) || text.startsWith('/')) return text;
    try {
      const parsed = new URL(text);
      return (parsed.protocol === 'http:' || parsed.protocol === 'https:') ? parsed.href : '';
    } catch {
      return /^[\w.-]+\.[\w.-]+/.test(text) ? `https://${text}` : '';
    }
  }

 function getHostnameLabel(url) {
    const normalizedUrl = normalizePreviewAssetUrl(url);
    if (!normalizedUrl) return '';
    try {
      return new URL(normalizedUrl, window.location.origin).hostname.replace(/^www\./, '');
    } catch {
      return '';
    }
  }

 function applyTextStyle(element, font, size, color) {
    if (!element) return;
    if (font) {
      element.style.fontFamily = font;
      loadFont(font);
    } else {
      element.style.removeProperty('font-family');
    }

    const numericSize = Number(size);
    if (Number.isFinite(numericSize) && numericSize > 0) {
      element.style.fontSize = `${numericSize}px`;
    } else {
      element.style.removeProperty('font-size');
    }

    if (color) {
      element.style.color = color;
    } else {
      element.style.removeProperty('color');
    }
  }

 function getRefs() {
    return ns.core?.getRefs?.() || {};
  }

 function getCurrentSettings() {
    return ns.core?.getCurrentSettings?.() || ns.currentSettings || {};
  }

 function loadFont(fontFamily) {
    if (!fontFamily || loadedFonts.has(fontFamily)) return;
    const url = FONT_URL_MAP[fontFamily];
    if (!url) return;

    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = url;
    document.head.appendChild(link);
    loadedFonts.add(fontFamily);
  }

 function populateFontSelects() {
    const refs = getRefs();
    const selects = [
      refs.homeTitleFontInput,
      refs.homeSubtitleFontInput,
      refs.homeStatsFontInput,
      refs.homeHitokotoFontInput,
      refs.cardTitleFontInput,
      refs.cardDescFontInput,
      refs.mobileCardTitleFontInput,
      refs.mobileCardDescFontInput,
    ];

    selects.forEach(select => {
      if (!select) return;
      select.innerHTML = '';
      FONT_OPTIONS.forEach(opt => {
        const option = document.createElement('option');
        option.value = opt.value;
        option.textContent = opt.label;
        select.appendChild(option);
      });
    });
  }

  ns.previewShared = {
    FONT_OPTIONS,
    FONT_URL_MAP,
    MAIN_COLOR_SCALES,
    escapeHTML,
    getRadioValue,
    normalizeCategoryPosition,
    getPreviewInputValue,
    getPreviewInputValueOrDefault,
    getPreviewNumberOrDefault,
    shouldHideCopyTextForPreview,
    normalizePreviewUrl,
    normalizePreviewAssetUrl,
    getHostnameLabel,
    applyTextStyle,
    getRefs,
    getCurrentSettings,
    loadFont,
    populateFontSelects,
  };
})();
