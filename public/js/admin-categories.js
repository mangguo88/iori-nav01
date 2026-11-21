/**
 * admin-categories.js
 * 分类管理功能：列表展示、增删改查、排序
 */

// 文件夹短名：全路径按 ' / ' 切最后一段，如 "收藏夹栏 / VPS类 / vps服务器" -> "vps服务器"；
// 完整路径保留在卡片标题的 title 悬停提示里
function shortCategoryName(fullName) {
    const parts = String(fullName || '').split('/').map((s) => s.trim()).filter(Boolean);
    return parts.length ? parts[parts.length - 1] : (String(fullName || '').trim() || '未分类');
}

// DOM Elements
const categoryGrid = document.getElementById('categoryGrid');
const categoryPrevPageBtn = document.getElementById('categoryPrevPage');
const categoryNextPageBtn = document.getElementById('categoryNextPage');
const categoryCurrentPageSpan = document.getElementById('categoryCurrentPage');
const categoryTotalPagesSpan = document.getElementById('categoryTotalPages');
const categoryPageSizeSelect = document.getElementById('categoryPageSizeSelect');
const addCategoryBtn = document.getElementById('addCategoryBtn');

// State
let categoryCurrentPage = 1;
let categoryPageSize = 10000; // Default show all for tree view structure
let categoryTotalItems = 0;
let currentViewParentId = null;

// 取 CSRF token：先读 /admin 页注入的 meta，没有再调 GET /api/csrf-token，拿到后缓存
let cachedCsrfToken = null;
async function getCsrfToken() {
    if (cachedCsrfToken) return cachedCsrfToken;
    const meta = document.querySelector('meta[name="csrf-token"]');
    const metaToken = meta && meta.getAttribute('content');
    if (metaToken) { cachedCsrfToken = metaToken; return cachedCsrfToken; }
    try {
        const res = await fetch('/api/csrf-token', { credentials: 'same-origin' });
        if (!res.ok) return null;
        const data = await res.json();
        if (data && data.csrfToken) { cachedCsrfToken = data.csrfToken; return cachedCsrfToken; }
    } catch (e) { /* 拿不到就返回 null，由调用方提示登录 */ }
    return null;
}

// 批量删除分组：勾选的分组 id（跨页/跨层级保留，删完清空）
const selectedCategoryIds = new Set();
const batchDeleteCategoriesBtn = document.getElementById('batchDeleteCategoriesBtn');
const categorySelectAllBtn = document.getElementById('categorySelectAllBtn');
const categorySelectedCount = document.getElementById('categorySelectedCount');

function updateCategorySelectionUI() {
    const count = selectedCategoryIds.size;
    if (categorySelectedCount) categorySelectedCount.textContent = count > 0 ? `已选 ${count} 个分组` : '';
    if (batchDeleteCategoriesBtn) {
        batchDeleteCategoriesBtn.disabled = count === 0;
        batchDeleteCategoriesBtn.classList.toggle('opacity-50', count === 0);
        batchDeleteCategoriesBtn.classList.toggle('cursor-not-allowed', count === 0);
    }
    document.querySelectorAll('#categoryGrid .category-select-checkbox').forEach((cb) => {
        cb.checked = selectedCategoryIds.has(Number(cb.getAttribute('data-category-id')));
    });
    document.querySelectorAll('#categoryGrid .site-card').forEach((card) => {
        const selected = selectedCategoryIds.has(Number(card.dataset.id));
        card.classList.toggle('ring-2', selected);
        card.classList.toggle('ring-red-400', selected);
    });
}

// 算一下选中分组连子分组、书签一共要删多少，用在删除确认框里
function computeDeletePreview(ids) {
    const byId = new Map((window.categoriesData || []).map((c) => [Number(c.id), c]));
    const uniqueIds = [...new Set(ids.map(Number))];
    const seen = new Set();
    const stack = [...uniqueIds];
    let sites = 0;
    while (stack.length) {
        const id = stack.pop();
        if (seen.has(id)) continue;
        seen.add(id);
        const cat = byId.get(id);
        if (cat) sites += Number(cat.site_count || 0);
        (window.categoriesData || []).filter((c) => Number(c.parent_id) === id).forEach((c) => stack.push(Number(c.id)));
    }
    return {
        totalCategories: seen.size,
        rootCount: uniqueIds.length,
        subCount: seen.size - uniqueIds.length,
        siteCount: sites,
        names: uniqueIds.map((id) => byId.get(id)?.catelog || `分组 #${id}`),
    };
}

function openBatchDeleteCategoriesModal(ids) {
    const preview = computeDeletePreview(ids);
    const modal = document.getElementById('deleteCategoryConfirmModal');
    const textEl = document.getElementById('deleteCategoryConfirmText');
    const warnEl = document.getElementById('deleteCategoryConfirmWarn');
    const names = preview.names.slice(0, 5).join('、') + (preview.names.length > 5 ? ` 等 ${preview.names.length} 个分组` : '');
    const confirmText = `确定要删除 ${names} 吗？共 ${preview.totalCategories} 个分组（含 ${preview.subCount} 个子分组）、${preview.siteCount} 个书签都会一起删掉，此操作无法撤销。`;
    if (textEl) textEl.textContent = confirmText;
    if (warnEl) warnEl.classList.remove('hidden');
    if (!modal) {
        if (confirm(confirmText)) deleteCategories(ids);
        return;
    }
    const confirmBtn = document.getElementById('confirmDeleteCategoryBtn');
    const cancelBtn = document.getElementById('cancelDeleteCategoryBtn');
    const closeBtn = document.getElementById('closeDeleteCategoryConfirmModal');
    const closeModal = () => {
        modal.style.display = 'none';
        document.body.classList.remove('modal-open');
    };
    // 使用 cloneNode 快速清除旧的 event listeners
    const newConfirmBtn = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
    newConfirmBtn.addEventListener('click', () => {
        closeModal();
        deleteCategories(ids);
    });
    cancelBtn.onclick = closeModal;
    closeBtn.onclick = closeModal;
    modal.onclick = (event) => {
        if (event.target === modal) closeModal();
    };
    modal.style.display = 'block';
    document.body.classList.add('modal-open');
}

async function deleteCategories(ids) {
    const csrfToken = await getCsrfToken();
    if (!csrfToken) {
        window.showMessage('登录已过期，请刷新页面重新登录后再删除', 'error');
        return;
    }
    let res;
    try {
        res = await fetch('/api/categories/batch-delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
            credentials: 'same-origin',
            body: JSON.stringify({ ids }),
        });
    } catch (err) {
        window.showMessage('网络错误: ' + err.message, 'error');
        return;
    }
    let data = null;
    try { data = await res.json(); } catch { /* 非 JSON 按失败处理 */ }
    if (res.status === 401) {
        cachedCsrfToken = null;
        window.showMessage('登录已过期，请刷新页面重新登录后再删除', 'error');
        return;
    }
    if (data && data.code === 200) {
        window.showMessage(data.message || '删除成功', 'success');
        ids.forEach((id) => selectedCategoryIds.delete(Number(id)));
        updateCategorySelectionUI();
        fetchCategories();
        if (typeof fetchConfigs === 'function') fetchConfigs();
        if (typeof window.loadGlobalCategories === 'function') window.loadGlobalCategories();
    } else {
        window.showMessage((data && data.message) || '删除失败', 'error');
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    initCategoryEvents();
    // 初始加载由 tab 切换或 admin.js 触发
});

function initCategoryEvents() {
    // 分组卡片大小三档（紧凑 / 默认 / 宽松），只影响 #categoryGrid 里的分组卡片
    initCategoryCardSize();

    // Page Size
    if (categoryPageSizeSelect) {
        categoryPageSizeSelect.value = categoryPageSize;
        categoryPageSizeSelect.addEventListener('change', () => {
            categoryPageSize = parseInt(categoryPageSizeSelect.value);
            categoryCurrentPage = 1;
            fetchCategories(categoryCurrentPage);
        });
    }

    // Pagination
    if (categoryPrevPageBtn) {
        categoryPrevPageBtn.addEventListener('click', () => {
            if (categoryCurrentPage > 1) {
                categoryCurrentPage--;
                fetchCategories(categoryCurrentPage);
            }
        });
    }

    if (categoryNextPageBtn) {
        categoryNextPageBtn.addEventListener('click', () => {
            if (categoryCurrentPage < Math.ceil(categoryTotalItems / categoryPageSize)) {
                categoryCurrentPage++;
                fetchCategories(categoryCurrentPage);
            }
        });
    }

    // Add Category Button
    if (addCategoryBtn) {
        addCategoryBtn.addEventListener('click', () => {
            // Populate dropdown with current tree
            // Ensure createCascadingDropdown is available (from admin.js)
            if (typeof window.createCascadingDropdown === 'function') {
                window.createCascadingDropdown('newCategoryParentWrapper', 'newCategoryParent', window.categoriesTree, '0');
            }
            const modal = document.getElementById('addCategoryModal');
            if (modal) {
                modal.style.display = 'block';
                document.body.classList.add('modal-open');
            }
        });
    }

    // 批量删除分组：工具栏按钮
    if (batchDeleteCategoriesBtn) {
        batchDeleteCategoriesBtn.addEventListener('click', () => {
            if (selectedCategoryIds.size === 0) return;
            openBatchDeleteCategoriesModal([...selectedCategoryIds]);
        });
    }
    if (categorySelectAllBtn) {
        categorySelectAllBtn.addEventListener('click', () => {
            const visibleIds = [...document.querySelectorAll('#categoryGrid .site-card')].map((c) => Number(c.dataset.id));
            if (visibleIds.length === 0) return;
            const allSelected = visibleIds.every((id) => selectedCategoryIds.has(id));
            visibleIds.forEach((id) => {
                if (allSelected) selectedCategoryIds.delete(id);
                else selectedCategoryIds.add(id);
            });
            updateCategorySelectionUI();
        });
    }
}

// Global function to be called by Tab switching in admin.js
window.fetchCategories = function(page = categoryCurrentPage) {
    if (!categoryGrid) return;
    
    categoryGrid.innerHTML = '<div class="col-span-full text-center py-10">加载中...</div>';
    
    fetch(`/api/categories?page=${page}&pageSize=${categoryPageSize}`)
        .then(res => res.json())
        .then(data => {
            if (data.code === 200) {
                categoryTotalItems = data.total;
                categoryCurrentPage = data.page;
                
                if (categoryTotalPagesSpan) categoryTotalPagesSpan.innerText = Math.ceil(categoryTotalItems / categoryPageSize);
                if (categoryCurrentPageSpan) categoryCurrentPageSpan.innerText = categoryCurrentPage;
                
                // Update global data (defined in admin.js)
                window.categoriesData = data.data || [];
                
                // Rebuild Tree
                if (typeof window.buildCategoryTree === 'function') {
                    window.categoriesTree = window.buildCategoryTree(window.categoriesData);
                }
                
                renderCategoryView(currentViewParentId);
                updateCategoryPaginationButtons();
                
                // Also refresh dropdowns if they exist in other tabs (optional but good consistency)
                // We might need a global event or callback for this.
            } else {
                window.showMessage(data.message || '加载分类失败', 'error');
                categoryGrid.innerHTML = '<div class="col-span-full text-center py-10 text-red-500">加载失败</div>';
            }
        }).catch((err) => {
            console.error('Fetch Categories Error:', err);
            window.showMessage('网络错误: ' + err.message, 'error');
            categoryGrid.innerHTML = '<div class="col-span-full text-center py-10 text-red-500">加载失败</div>';
        });
};

function updateCategoryPaginationButtons() {
    if (categoryPrevPageBtn) categoryPrevPageBtn.disabled = categoryCurrentPage <= 1;
    if (categoryNextPageBtn) categoryNextPageBtn.disabled = categoryCurrentPage >= Math.ceil(categoryTotalItems / categoryPageSize);
}

function renderCategoryView(parentId) {
    currentViewParentId = parentId;
    updateCategoryBreadcrumb(parentId);
    
    let nodesToRender = [];
    if (!parentId || parentId == '0') {
        nodesToRender = window.categoriesTree || [];
    } else {
        // Find the node in the tree
        const findNode = (nodes, id) => {
            for(const node of nodes) {
                if(node.id == id) return node;
                if(node.children) {
                    const found = findNode(node.children, id);
                    if(found) return found;
                }
            }
            return null;
        };
        const parentNode = findNode(window.categoriesTree, parentId);
        if(parentNode && parentNode.children) {
            nodesToRender = parentNode.children;
        } else {
            nodesToRender = [];
        }
    }
    renderCategoryCards(nodesToRender);
}

function updateCategoryBreadcrumb(parentId) {
    const backBtn = document.getElementById('categoryBackBtn');
    const breadcrumb = document.getElementById('categoryBreadcrumb');
    
    if(!parentId || parentId == '0') {
        if(backBtn) backBtn.classList.add('hidden');
        if(breadcrumb) breadcrumb.textContent = '顶级分类';
    } else {
        if(backBtn) backBtn.classList.remove('hidden');
        const cat = window.categoriesData.find(c => c.id == parentId);
        if(breadcrumb) breadcrumb.textContent = cat ? cat.catelog : '未知分类';
        
        if (backBtn) {
            backBtn.onclick = () => {
                 const currentCat = window.categoriesData.find(c => c.id == parentId);
                 if(currentCat && currentCat.parent_id && currentCat.parent_id != '0') {
                     renderCategoryView(currentCat.parent_id);
                 } else {
                     renderCategoryView(null);
                 }
            };
        }
    }
}

// 分组卡片大小三档：紧凑 / 默认 / 宽松（只影响 #categoryGrid 里的分组卡片，
// 选择存 localStorage，后台展示偏好，不进 D1 设置；刷新后保持上次的选择）
const CATEGORY_CARD_SIZE_KEY = 'admin_category_card_size';
const CATEGORY_CARD_SIZES = ['compact', 'default', 'roomy'];

function applyCategoryCardSize(size) {
    const value = CATEGORY_CARD_SIZES.includes(size) ? size : 'default';
    if (categoryGrid) {
        categoryGrid.classList.remove('cat-size-compact', 'cat-size-default', 'cat-size-roomy');
        categoryGrid.classList.add('cat-size-' + value);
    }
    document.querySelectorAll('.cat-size-switch [data-cat-size]').forEach((btn) => {
        btn.classList.toggle('cat-size-active', btn.getAttribute('data-cat-size') === value);
    });
    try { localStorage.setItem(CATEGORY_CARD_SIZE_KEY, value); } catch (e) { /* 隐私模式等写不进时静默忽略 */ }
}

function initCategoryCardSize() {
    let saved = 'default';
    try { saved = localStorage.getItem(CATEGORY_CARD_SIZE_KEY) || 'default'; } catch (e) { /* 读不到就用默认 */ }
    applyCategoryCardSize(saved);
    document.querySelectorAll('.cat-size-switch [data-cat-size]').forEach((btn) => {
        btn.addEventListener('click', () => applyCategoryCardSize(btn.getAttribute('data-cat-size')));
    });
}

function renderCategoryCards(categories) {
    if (!categoryGrid) return;
    categoryGrid.innerHTML = '';
    if (!categories || categories.length === 0) {
        categoryGrid.innerHTML = '<div class="col-span-full text-center text-gray-500 py-10">没有子分类数据</div>';
        return;
    }

    categories.forEach(item => {
        const card = document.createElement('div');
        const safeName = window.escapeHTML(shortCategoryName(item.catelog));
        const safeFullName = window.escapeHTML(item.catelog);
        const siteCount = item.site_count || 0;
        const sortValue = item.sort_order === null || item.sort_order === 9999 ? '默认' : item.sort_order;
        const subCount = item.children ? item.children.length : 0;

        // Private Icon
        const privateIcon = item.is_private ? `<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 ml-2 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" title="私密分类"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>` : '';

        card.className = 'site-card group bg-white border border-primary-100/60 rounded-xl shadow-sm overflow-hidden relative cursor-move';
        card.draggable = true;
        card.dataset.id = item.id;
        card.dataset.sort = item.sort_order;

        card.innerHTML = `
            <input type="checkbox" class="category-select-checkbox absolute top-2 left-2 z-20 h-5 w-5 accent-red-600 cursor-pointer" data-category-id="${item.id}" title="勾选这个分组（可多选，批量删除）">
            <div class="absolute top-2 right-2 flex space-x-1 opacity-0 group-hover:opacity-100 transition-opacity z-20">
                <button class="category-edit-btn p-1.5 bg-blue-100 text-blue-600 rounded-full hover:bg-blue-200 transition-colors" title="编辑" data-category-id="${item.id}">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                </button>
                <button class="category-del-btn p-1.5 bg-red-100 text-red-600 hover:bg-red-200 rounded-full transition-colors" title="删除" data-category-id="${item.id}" data-site-count="${siteCount}" data-sub-count="${subCount}">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>

            <div class="p-5">
                <div class="flex items-center justify-between mb-2">
                    <div class="flex items-center min-w-0">
                        <h3 class="text-lg font-medium text-gray-900 truncate" title="${safeFullName}">${safeName}</h3>
                        ${privateIcon}
                    </div>
                    <span class="bg-primary-50 text-primary-700 text-xs px-2 py-1 rounded-full border border-primary-100 flex-shrink-0 ml-2">ID: ${item.id}</span>
                </div>
                
                <div class="flex items-center text-sm text-gray-500 mt-4 space-x-4">
                    <div class="flex items-center" title="直接包含的书签数">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-1 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                        </svg>
                        <span>${siteCount}</span>
                    </div>
                    <div class="flex items-center" title="子分类数量">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-1 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
                        </svg>
                        <span>${subCount} 子分类</span>
                    </div>
                    <div class="flex items-center">
                        <span>排序: ${sortValue}</span>
                    </div>
                </div>
                
                <div class="mt-4 pt-3 border-t border-gray-100 flex justify-end">
                    <button class="category-subs-btn text-xs flex items-center px-2 py-1 bg-indigo-50 text-indigo-600 rounded hover:bg-indigo-100 transition-colors" data-category-id="${item.id}">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                        </svg>
                        管理子分类
                    </button>
                </div>
            </div>
        `;
        categoryGrid.appendChild(card);
    });

    bindCategoryEvents();
    setupCategoryDragAndDrop();
    updateCategorySelectionUI();
}

function bindCategoryEvents() {
    document.querySelectorAll('.category-select-checkbox').forEach(cb => {
        cb.addEventListener('click', function (e) {
            e.stopPropagation();
        });
        cb.addEventListener('change', function () {
            const categoryId = Number(this.getAttribute('data-category-id'));
            if (this.checked) selectedCategoryIds.add(categoryId);
            else selectedCategoryIds.delete(categoryId);
            updateCategorySelectionUI();
        });
    });

    document.querySelectorAll('.category-edit-btn').forEach(btn => {
        btn.addEventListener('click', function (e) {
            e.stopPropagation();
            const categoryId = this.getAttribute('data-category-id');
            const category = window.categoriesData.find(c => c.id == categoryId);
            if (category) {
                document.getElementById('editCategoryId').value = category.id;
                document.getElementById('editCategoryName').value = category.catelog;
                const sortOrder = category.sort_order;
                document.getElementById('editCategorySortOrder').value = (sortOrder === null || sortOrder === 9999) ? '' : sortOrder;
                document.getElementById('editCategoryIsPrivate').checked = !!category.is_private;
                
                if (typeof window.createCascadingDropdown === 'function') {
                    window.createCascadingDropdown('editCategoryParentWrapper', 'editCategoryParent', window.categoriesTree, category.parent_id || '0', category.id);
                }

                document.getElementById('editCategoryModal').style.display = 'block';
                document.body.classList.add('modal-open');
            } else {
                window.showMessage('找不到分类数据', 'error');
            }
        });
    });

    document.querySelectorAll('.category-del-btn').forEach(btn => {
        btn.addEventListener('click', function (e) {
            e.stopPropagation();
            const category_id = this.getAttribute('data-category-id');
            if (!category_id) return;
            // 单个删除也走批量删除接口：带子分组和书签一起删，
            // 确认框里会先算好一共删多少个分组、多少个书签
            openBatchDeleteCategoriesModal([Number(category_id)]);
        });
    });
  
    document.querySelectorAll('.category-subs-btn').forEach(btn => {
        btn.addEventListener('click', function (e) {
            e.stopPropagation();
            const categoryId = this.getAttribute('data-category-id');
            renderCategoryView(categoryId);
        });
    });
}

// 旧的单删入口：现在也走批量删除接口（带子分组和书签一起删）。
// 后端 PUT /api/categories/:id + {reset:true} 只删空分组，仍保留给兼容用。
function deleteCategory(id) {
    deleteCategories([Number(id)]);
}

function setupCategoryDragAndDrop() {
    const cards = document.querySelectorAll('#categoryGrid .site-card');
    let draggedItem = null;

    cards.forEach(card => {
        card.addEventListener('dragstart', function (e) {
            draggedItem = this;
            this.classList.add('opacity-50', 'scale-95');
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/html', this.innerHTML);
        });

        card.addEventListener('dragend', function () {
            this.classList.remove('opacity-50', 'scale-95');
            draggedItem = null;
            document.querySelectorAll('#categoryGrid .site-card').forEach(c => c.classList.remove('border-2', 'border-accent-500'));
        });

        card.addEventListener('dragover', function (e) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            this.classList.add('border-2', 'border-accent-500');
        });

        card.addEventListener('dragleave', function () {
            this.classList.remove('border-2', 'border-accent-500');
        });

        card.addEventListener('drop', function (e) {
            e.preventDefault();
            this.classList.remove('border-2', 'border-accent-500');

            if (draggedItem !== this) {
                const allCards = Array.from(categoryGrid.children);
                const draggedIdx = allCards.indexOf(draggedItem);
                const droppedIdx = allCards.indexOf(this);

                if (draggedIdx < droppedIdx) {
                    this.after(draggedItem);
                } else {
                    this.before(draggedItem);
                }

                saveCategorySortOrder();
            }
        });
    });
}

function saveCategorySortOrder() {
    const cards = document.querySelectorAll('#categoryGrid .site-card');
    const items = [];

    cards.forEach((card, index) => {
        const id = Number(card.dataset.id);
        const newSortOrder = index + 1;
        const category = window.categoriesData.find(c => c.id == id);
        if (!category) return;

        items.push({
            id,
            sort_order: newSortOrder
        });
    });

    if (items.length > 0) {
        window.showMessage('正在保存分类排序...', 'info');
        fetch('/api/categories/reorder', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ items })
        })
            .then(res => res.json())
            .then(data => {
                if (data.code !== 200) {
                    window.showMessage(data.message || '分类排序失败', 'error');
                    return;
                }

                window.showMessage('分类排序已保存', 'success');

                items.forEach(item => {
                    const category = window.categoriesData.find(c => c.id == item.id);
                    if (category) {
                        category.sort_order = item.sort_order;
                    }
                });

                // Refresh to sync state
                fetchCategories();
                // Also refresh main config as order might affect things? Probably not but safe.
                if (typeof fetchConfigs === 'function') fetchConfigs();
            })
            .catch(err => window.showMessage('保存排序失败: ' + err.message, 'error'));
    }
}


// ========== 编辑分类功能 ==========
const editCategoryModal = document.getElementById('editCategoryModal');
const closeEditCategoryModal = document.getElementById('closeEditCategoryModal');
const editCategoryForm = document.getElementById('editCategoryForm');

const cancelEditCategoryBtn = document.getElementById('cancelEditCategoryBtn');
if (cancelEditCategoryBtn) {
  cancelEditCategoryBtn.addEventListener('click', () => {
    editCategoryModal.style.display = 'none';
    document.body.classList.remove('modal-open');
  });
}

if (closeEditCategoryModal) {
    closeEditCategoryModal.addEventListener('click', () => {
        editCategoryModal.style.display = 'none';
        document.body.classList.remove('modal-open');
    });
}

if (editCategoryForm) {
    editCategoryForm.addEventListener('submit', function (e) {
        e.preventDefault();

        const id = document.getElementById('editCategoryId').value;
        const categoryName = document.getElementById('editCategoryName').value.trim();
        const sortOrder = document.getElementById('editCategorySortOrder').value.trim();
        const parentId = document.getElementById('editCategoryParent').value;
        const isPrivate = document.getElementById('editCategoryIsPrivate').checked;

        if (!categoryName) {
            window.showMessage('分类名称不能为空', 'error');
            return;
        }

        // Check duplicate name (excluding self)
        const isDuplicate = window.categoriesData.some(category => category.catelog === categoryName && category.id != id);
        if (isDuplicate) {
            window.showMessage('该分类名称已存在', 'error');
            return;
        }

        const payload = {
            catelog: categoryName,
            parent_id: parentId,
            is_private: isPrivate
        };

        if (sortOrder !== '') {
            payload.sort_order = Number(sortOrder);
        }

        fetch(`/api/categories/${id}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        }).then(res => res.json())
            .then(data => {
                if (data.code === 200) {
                    window.showMessage('分类更新成功', 'success');
                    editCategoryModal.style.display = 'none';
                    document.body.classList.remove('modal-open');
                    fetchCategories(categoryCurrentPage);
                    // 刷新主界面数据（因为分类名可能变了）
                    if (typeof fetchConfigs === 'function') fetchConfigs();
                    if (typeof window.loadGlobalCategories === 'function') window.loadGlobalCategories();
                } else {
                    window.showMessage(data.message || '分类更新失败', 'error');
                }
            }).catch(err => {
                window.showMessage('网络错误: ' + err.message, 'error');
            });
    });
}

// ========== 新增分类功能 ==========
const addCategoryModal = document.getElementById('addCategoryModal');
const closeCategoryModal = document.getElementById('closeCategoryModal');
const addCategoryForm = document.getElementById('addCategoryForm');

const cancelAddCategoryBtn = document.getElementById('cancelAddCategoryBtn');
if (cancelAddCategoryBtn) {
  cancelAddCategoryBtn.addEventListener('click', () => {
    addCategoryModal.style.display = 'none';
    document.body.classList.remove('modal-open');
    if (addCategoryForm) addCategoryForm.reset();
  });
}

if (closeCategoryModal) {
    closeCategoryModal.addEventListener('click', () => {
        addCategoryModal.style.display = 'none';
        document.body.classList.remove('modal-open');
        addCategoryForm.reset();
    });
}

// 提交新增分类表单
if (addCategoryForm) {
    addCategoryForm.addEventListener('submit', function (e) {
        e.preventDefault();

        const categoryName = document.getElementById('newCategoryName').value.trim();
        const sortOrder = document.getElementById('newCategorySortOrder').value.trim();
        const parentId = document.getElementById('newCategoryParent').value;
        const isPrivate = document.getElementById('newCategoryIsPrivate').checked;

        if (!categoryName) {
            window.showMessage('分类名称不能为空', 'error');
            return;
        }

        const payload = {
            catelog: categoryName,
            parent_id: parentId,
            is_private: isPrivate
        };

        if (sortOrder !== '') {
            payload.sort_order = Number(sortOrder);
        }

        fetch('/api/categories/create', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        }).then(res => res.json())
            .then(data => {
                if (data.code === 201 || data.code === 200) {
                    window.showMessage('分类创建成功', 'success');
                    addCategoryModal.style.display = 'none';
                    document.body.classList.remove('modal-open');
                    addCategoryForm.reset();

                    fetchCategories();
                    // 刷新主界面数据（因为主界面数据也变了，比如下拉框需要更新）
                    if (typeof fetchConfigs === 'function') fetchConfigs();
                    if (typeof window.loadGlobalCategories === 'function') window.loadGlobalCategories();
                } else {
                    window.showMessage(data.message || '分类创建失败', 'error');
                }
            }).catch(err => {
                window.showMessage('网络错误: ' + err.message, 'error');
            });
    });
}
