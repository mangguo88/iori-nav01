// functions/lib/menu-renderer.js
// 渲染分类菜单 HTML（水平导航 + 左侧栏文件夹树）

import { escapeHTML } from './utils';

/**
 * 文件夹短名：全路径按 ' / ' 切最后一段，如
 * "收藏夹栏 / VPS类 / vps服务器" -> "vps服务器"；没有 '/' 就原样返回。
 * 完整路径保留在 title 悬停提示与 data-full-name 里。
 */
export function shortCategoryName(fullName) {
  const parts = String(fullName || '').split('/').map((s) => s.trim()).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : (String(fullName || '').trim() || '未分类');
}

/**
 * 渲染水平导航菜单
 * @param {Array} cats - 分类树
 * @param {string} currentCatalogName - 当前选中的分类名（完整路径）
 * @returns {string} HTML 字符串
 */
export function renderHorizontalMenu(cats, currentCatalogName) {
  if (!cats || cats.length === 0) return '';
  return _renderHorizontalItems(cats, currentCatalogName, 0);
}

function _renderHorizontalItems(cats, currentCatalogName, level) {
  return cats.map(cat => {
    const isActive = currentCatalogName === cat.catelog;
    const hasChildren = cat.children && cat.children.length > 0;
    const safeName = escapeHTML(cat.catelog);
    const shortName = escapeHTML(shortCategoryName(cat.catelog));
    const catalogParam = encodeURIComponent(String(cat.id));
    const linkUrl = `?catalog=${catalogParam}`;

    const isRoot = level === 0;
    const activeClass = isActive ? 'active' : (isRoot ? 'inactive' : '');
    const navItemActiveClass = isActive ? 'nav-item-active' : '';
    const wrapperClass = isRoot ? 'menu-item-wrapper relative inline-block text-left' : 'menu-item-wrapper relative block w-full';
    const linkClass = isRoot ? `nav-btn ${activeClass} ${navItemActiveClass}` : `dropdown-item ${activeClass} ${navItemActiveClass}`;
    const arrowSvg = hasChildren
      ? (isRoot
        ? '<svg class="w-3 h-3 ml-1 opacity-70"><use href="#icon-chevron-down"/></svg>'
        : '<svg class="dropdown-arrow-icon"><use href="#icon-chevron-right"/></svg>')
      : '';
    const childrenHtml = hasChildren ? `<div class="dropdown-menu">${_renderHorizontalItems(cat.children, currentCatalogName, level + 1)}</div>` : '';

    return `<div class="${wrapperClass}"><a href="${linkUrl}" class="${linkClass}" data-id="${cat.id}" data-full-name="${safeName}" title="${safeName}">${shortName}${arrowSvg}</a>${childrenHtml}</div>`;
  }).join('');
}

/**
 * 按全路径分段构建左侧栏文件夹树（如 "收藏夹栏 / VPS类 / vps服务器"
 * 拼成 收藏夹栏 -> VPS类 -> vps服务器 三层）。
 * 中间节点不一定对应真实分类（没有 id 时只做分组头，不可点跳）。
 * 每个节点记直接书签数，向上汇总成含子文件夹的总数。
 * 后台手动建的子分类（parent_id 非空、catelog 只是短名）挂到父分类节点下。
 * @param {Array} cats - 分类列表（每项含 id / catelog / parent_id）
 * @param {Map} directSiteCounts - 分类 id -> 直接书签数
 * @returns {object} 路径树根节点 { name, fullPath, id, count, children: [] }
 */
export function buildCategoryPathTree(cats, directSiteCounts) {
  const root = { name: '', fullPath: '', id: null, count: 0, children: [] };
  const childMaps = new Map();
  const nodeById = new Map();
  childMaps.set(root, new Map());
  const insertPath = (parts, catId) => {
    let node = root;
    let path = '';
    for (const part of parts) {
      path = path ? `${path} / ${part}` : part;
      const siblings = childMaps.get(node);
      if (!siblings.has(part)) {
        const child = { name: part, fullPath: path, id: null, count: 0, children: [] };
        siblings.set(part, child);
        node.children.push(child);
        childMaps.set(child, new Map());
      }
      node = siblings.get(part);
    }
    // 同一路径重复出现时保留先出现的 id（分类名唯一，正常不会重复）
    if ((node.id === null || node.id === undefined) && catId !== null && catId !== undefined) {
      node.id = catId;
      nodeById.set(catId, node);
    }
    return node;
  };
  const categoryMap = new Map((cats || []).map((c) => [c.id, c]));
  const parentedCats = [];
  for (const cat of cats || []) {
    if (cat.parent_id && categoryMap.has(cat.parent_id)) {
      parentedCats.push(cat);
      continue;
    }
    const parts = String(cat.catelog || '').split('/').map((s) => s.trim()).filter(Boolean);
    if (parts.length === 0) continue;
    insertPath(parts, cat.id);
  }
  for (const cat of parentedCats) {
    const parentNode = nodeById.get(cat.parent_id);
    const shortName = shortCategoryName(cat.catelog);
    if (!parentNode) {
      // 父分类不在列表里（比如被设为私密而当前访客看不到）：按路径放回根部
      insertPath([shortName], cat.id);
      continue;
    }
    const child = { name: shortName, fullPath: `${parentNode.fullPath} / ${shortName}`, id: cat.id, count: 0, children: [] };
    parentNode.children.push(child);
    nodeById.set(cat.id, child);
  }
  const rollup = (n) => {
    let total = (n.id !== null && n.id !== undefined) ? (directSiteCounts.get(n.id) || 0) : 0;
    for (const c of n.children) total += rollup(c);
    n.count = total;
    return total;
  };
  rollup(root);
  return root;
}

/**
 * 渲染左侧栏文件夹树（按全路径分段嵌套，如 "收藏夹栏 / VPS类 / vps服务器"
 * 拼成 收藏夹栏 -> VPS类 -> vps服务器 三层；中间节点不一定对应真实分类，
 * 没有 id 的节点只做分组头，点名称只折叠/展开，不跳转）。
 * @param {object} root - 路径树根节点 { name, fullPath, id, count, children: [] }
 * @param {number|null} currentCatalogId - 当前选中的分类 id
 * @returns {string} HTML 字符串
 */
export function renderSidebarTree(root, currentCatalogId) {
  if (!root || !root.children || root.children.length === 0) return '';
  return root.children.map((node) => _renderSidebarNode(node, currentCatalogId)).join('');
}

/**
 * 渲染左侧栏小舒式列表（仿 BoTab 侧栏，只学展示形式）：
 * 纯文字竖排，只列顶级文件夹——每个一级节点一行，紧接着列出它的一级子文件夹
 * （如 收藏夹栏、VPS类、账号类、工具类……）；没有折叠、没有文件夹图标、
 * 没有数量、不截断名字。当前分类或其祖先分类那一行变蓝。
 * @param {object} root - buildCategoryPathTree 返回的路径树根节点
 * @param {string} currentCatalogFullPath - 当前选中的分类完整路径（为空表示“全部”）
 * @returns {string} HTML 字符串
 */
export function renderSidebarBotab(root, currentCatalogFullPath) {
  if (!root || !root.children || root.children.length === 0) return '';
  const currentPath = String(currentCatalogFullPath || '').trim();
  const isActivePath = (fullPath) => currentPath !== '' && (currentPath === fullPath || currentPath.startsWith(fullPath + ' / '));
  const rows = [];
  const pushRow = (node) => {
    const safeFull = escapeHTML(node.fullPath);
    const shortName = escapeHTML(node.name);
    const active = isActivePath(node.fullPath);
    const activeClass = active
      ? 'bg-secondary-100 text-primary-700 dark:bg-gray-800 dark:text-primary-400'
      : 'hover:bg-gray-100 text-gray-700 dark:text-gray-300 dark:hover:bg-gray-800';
    if (node.id !== null && node.id !== undefined) {
      rows.push(`<div class="sidebar-botab-row"><a href="?catalog=${encodeURIComponent(String(node.id))}" data-id="${node.id}" data-full-name="${safeFull}" title="${safeFull}" class="sidebar-botab-link flex items-center px-3 py-2 rounded-lg flex-1 min-w-0 transition-colors duration-200 ${activeClass}"><span class="sidebar-botab-name">${shortName}</span></a></div>`);
    } else {
      rows.push(`<div class="sidebar-botab-row"><span class="sidebar-botab-link sidebar-botab-group flex items-center px-3 py-2 rounded-lg flex-1 min-w-0 text-gray-500 dark:text-gray-400" title="${safeFull}"><span class="sidebar-botab-name">${shortName}</span></span></div>`);
    }
  };
  for (const node of root.children) {
    pushRow(node);
    if (node.children && node.children.length > 0) {
      for (const child of node.children) pushRow(child);
    }
  }
  return rows.join('');
}

function _renderSidebarNode(node, currentCatalogId) {
  const safeFull = escapeHTML(node.fullPath);
  const shortName = escapeHTML(node.name);
  const hasChildren = node.children && node.children.length > 0;
  const isActive = node.id !== null && node.id !== undefined && String(node.id) === String(currentCatalogId);
  const activeClass = isActive
    ? 'bg-secondary-100 text-primary-700 dark:bg-gray-800 dark:text-primary-400'
    : 'hover:bg-gray-100 text-gray-700 dark:text-gray-300 dark:hover:bg-gray-800';
  const iconClass = isActive ? 'text-primary-600 dark:text-primary-400' : 'text-gray-400 dark:text-gray-500';
  const count = Number(node.count) || 0;

  const toggleHtml = hasChildren
    ? `<button type="button" class="sidebar-tree-toggle" data-toggle-path="${safeFull}" aria-expanded="true" title="折叠/展开"><svg class="h-3.5 w-3.5"><use href="#icon-chevron-down"/></svg></button>`
    : '<span class="sidebar-tree-toggle-spacer"></span>';

  // 真实分类：可点链接；虚拟分组头：只显示名字，点名称折叠/展开（JS 绑 .sidebar-tree-group）
  const linkHtml = node.id !== null && node.id !== undefined
    ? `<a href="?catalog=${encodeURIComponent(String(node.id))}" data-id="${node.id}" data-full-name="${safeFull}" title="${safeFull}" class="sidebar-tree-link flex items-center px-3 py-2 rounded-lg flex-1 min-w-0 transition-colors duration-200 ${activeClass}">
        <svg class="h-5 w-5 mr-2 flex-shrink-0 ${iconClass}"><use href="#icon-folder"/></svg>
        <span class="sidebar-tree-name truncate">${shortName}</span>
      </a>`
    : `<span class="sidebar-tree-link sidebar-tree-group flex items-center px-3 py-2 rounded-lg flex-1 min-w-0 text-gray-700 dark:text-gray-300 cursor-pointer" title="${safeFull}">
        <svg class="h-5 w-5 mr-2 flex-shrink-0 ${iconClass}"><use href="#icon-folder"/></svg>
        <span class="sidebar-tree-name truncate">${shortName}</span>
      </span>`;

  const childrenHtml = hasChildren
    ? `<div class="sidebar-tree-children">${node.children.map((c) => _renderSidebarNode(c, currentCatalogId)).join('')}</div>`
    : '';

  return `<div class="sidebar-tree-node" data-tree-path="${safeFull}">
    <div class="sidebar-tree-row flex items-center">${toggleHtml}${linkHtml}<span class="sidebar-tree-count" title="${count} 个书签（含子文件夹）">${count}</span></div>
    ${childrenHtml}
  </div>`;
}
