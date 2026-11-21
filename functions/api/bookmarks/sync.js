// functions/api/bookmarks/sync.js
// 浏览器扩展自动同步接口：新增 / 改名 / 改链接 / 移动文件夹 / 删除书签时，
// 由扩展实时推送到这里，直接写入 sites 表，无需管理员再审核、再手动导入。
//
// 鉴权：不走 admin_session Cookie（扩展拿不到 HttpOnly Cookie，也靠不住），
// 改用 Bearer Token：请求头 Authorization: Bearer <SYNC_TOKEN>，
// SYNC_TOKEN 只放在 Cloudflare Pages 的环境变量里，不要写进仓库代码。
// 部署前必须在 Pages -> 设置 -> 环境变量里新建 SYNC_TOKEN（随机长字符串），
// 否则本接口一律返回 503，拒绝同步。
//
// 分类方案：不改数据库结构。文件夹完整路径拼成一个分类名，
// 如 Chrome 里“工作 / 工具” -> category.catelog = "工作 / 工具"。
// 顶层“书签栏 / 其他书签 / Bookmarks Bar / Other Bookmarks”会被去掉，
// 没有文件夹的书签归到“未分类”。同名子文件夹在不同父文件夹下不会合并，
// 因为分类名带了完整路径。备注（desc）同步时不覆盖：新建为空，
// 更新/移动只改标题、链接、分类，已在后台手写的备注会保留。
//
// 请求体（POST，JSON，二选一）：
//   单条：{ "action": "upsert"|"update"|"move"|"delete",
//           "name": "标题", "url": "https://…",
//           "folderPath": "工作 / 工具", "oldUrl": "改链接前的旧地址（可选）" }
//   批量：{ "action": "batch", "bookmarks": [{ "name", "url", "folderPath" }, …] }
//   批量删除：{ "action": "delete", "urls": ["https://…", …] }
// GET 仅用于扩展“测试连接”，同样要带 Token，返回 { code: 200, ok: true }。

import { errorResponse, jsonResponse, normalizeSortOrder } from '../../_middleware';

const TOP_LEVEL_FOLDERS = new Set([
  '书签栏', 'Bookmarks Bar', 'Bookmarks bar',
  '其他书签', 'Other Bookmarks', 'Other bookmarks',
  '移动设备书签', 'Mobile Bookmarks',
  '书签', '所有书签',
]);

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function corsJson(data, status = 200) {
  const res = jsonResponse(data, status);
  for (const [k, v] of Object.entries(CORS_HEADERS)) res.headers.set(k, v);
  return res;
}

function corsError(message, status) {
  const res = errorResponse(message, status);
  for (const [k, v] of Object.entries(CORS_HEADERS)) res.headers.set(k, v);
  return res;
}

function checkToken(request, env) {
  const configured = (env.SYNC_TOKEN || '').trim();
  if (!configured) return { ok: false, status: 503, message: 'SYNC_TOKEN 未配置：请在 Cloudflare Pages 环境变量里设置 SYNC_TOKEN 后重新部署' };
  const auth = request.headers.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token || token !== configured) return { ok: false, status: 401, message: 'Unauthorized: SYNC_TOKEN 不正确' };
  return { ok: true };
}

// "工作 / 工具" / "工作/工具" / " 工作 / 工具 " -> "工作 / 工具"；空或只有顶层 -> "未分类"
function normalizeFolderPath(folderPath) {
  if (!folderPath || typeof folderPath !== 'string') return '未分类';
  const parts = folderPath.split('/').map((s) => s.trim()).filter((s) => s && !TOP_LEVEL_FOLDERS.has(s));
  return parts.length ? parts.join(' / ') : '未分类';
}

function isValidUrl(url) {
  return typeof url === 'string' && (url.startsWith('http://') || url.startsWith('https://'));
}

function logoFor(url, env) {
  const iconAPI = env.ICON_API || 'https://favicon.im/';
  try {
    const domain = url.replace(/^https?:\/\//, '').split('/')[0];
    return `${iconAPI}${domain}${!env.ICON_API ? '?larger=true' : ''}`;
  } catch {
    return null;
  }
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function onRequestGet(context) {
  const auth = checkToken(context.request, context.env);
  if (!auth.ok) return corsError(auth.message, auth.status);
  return corsJson({ code: 200, ok: true, message: 'sync endpoint ready' });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const auth = checkToken(request, env);
  if (!auth.ok) return corsError(auth.message, auth.status);
  if (!env.NAV_DB) return corsError('NAV_DB 未绑定', 500);

  let body;
  try {
    body = await request.json();
  } catch {
    return corsError('请求体不是合法 JSON', 400);
  }

  const db = env.NAV_DB;
  const BATCH_SIZE = 100;

  // 分类名 -> id 的本请求内缓存，避免每条书签都查一次
  const categoryCache = new Map();
  async function resolveCategoryId(folderPath) {
    const name = normalizeFolderPath(folderPath);
    if (categoryCache.has(name)) return categoryCache.get(name);
    const existing = await db.prepare('SELECT id FROM category WHERE catelog = ?').bind(name).first();
    if (existing) {
      categoryCache.set(name, existing.id);
      return existing.id;
    }
    const inserted = await db.prepare('INSERT INTO category (catelog, sort_order) VALUES (?, ?)')
      .bind(name, normalizeSortOrder(9999)).run();
    const id = inserted?.meta?.last_row_id
      || (await db.prepare('SELECT id FROM category WHERE catelog = ?').bind(name).first())?.id;
    if (!id) throw new Error(`创建分类失败：${name}`);
    categoryCache.set(name, id);
    return id;
  }

  // 单条 upsert：按 URL 去重；已存在只改标题/链接/分类，不动 desc（备注）和 logo（除非原来没有）
  async function upsertOne(item) {
    const url = (item.url || '').trim();
    const oldUrl = (item.oldUrl || '').trim();
    const name = (item.name || '').trim() || url;
    if (!isValidUrl(url)) return { skipped: 1 };
    const catelogId = await resolveCategoryId(item.folderPath);

    let existing = (await db.prepare('SELECT id, logo, desc FROM sites WHERE url = ?').bind(url).first()) || null;
    if (!existing && oldUrl && oldUrl !== url) {
      existing = (await db.prepare('SELECT id, logo, desc FROM sites WHERE url = ?').bind(oldUrl).first()) || null;
    }
    if (existing) {
      await db.prepare('UPDATE sites SET name = ?, url = ?, catelog_id = ?, update_time = CURRENT_TIMESTAMP WHERE id = ?')
        .bind(name, url, catelogId, existing.id).run();
      return { updated: 1 };
    }
    await db.prepare('INSERT INTO sites (name, url, logo, desc, catelog_id, sort_order) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(name, url, logoFor(url, env), null, catelogId, normalizeSortOrder(9999)).run();
    return { added: 1 };
  }

  async function deleteByUrl(url) {
    const u = (url || '').trim();
    if (!isValidUrl(u)) return 0;
    const res = await db.prepare('DELETE FROM sites WHERE url = ?').bind(u).run();
    return res?.meta?.changes || 0;
  }

  try {
    // ---- 批量删除（删文件夹时扩展会发 urls 数组）----
    if (body && body.action === 'delete' && Array.isArray(body.urls)) {
      let deleted = 0;
      for (const u of body.urls) deleted += await deleteByUrl(u);
      return corsJson({ code: 200, message: `已删除 ${deleted} 个书签`, data: { deleted } });
    }

    // ---- 批量同步（扩展首次全量同步 / 批量导入）----
    const bookmarks = Array.isArray(body) ? body : (Array.isArray(body?.bookmarks) ? body.bookmarks : null);
    if (bookmarks) {
      if (bookmarks.length === 0) return corsJson({ code: 200, message: '没有可同步的书签', data: { added: 0, updated: 0, skipped: 0 } });
      // 同一批里同 URL 以最后一条为准
      const byUrl = new Map();
      for (const b of bookmarks) {
        const url = (b?.url || '').trim();
        if (url) byUrl.set(url, b);
      }
      const items = [...byUrl.values()];
      let added = 0, updated = 0, skipped = 0;
      // 先建好所有分类
      for (const item of items) await resolveCategoryId(item.folderPath);
      // 再一次性查出已存在的 URL
      const existingUrls = new Set();
      const urls = items.map((i) => (i.url || '').trim()).filter(isValidUrl);
      for (let i = 0; i < urls.length; i += BATCH_SIZE) {
        const chunk = urls.slice(i, i + BATCH_SIZE);
        const placeholders = chunk.map(() => '?').join(',');
        const { results } = await db.prepare(`SELECT url FROM sites WHERE url IN (${placeholders})`).bind(...chunk).all();
        (results || []).forEach((r) => existingUrls.add(r.url));
      }
      const insertStmts = [];
      const updateStmts = [];
      for (const item of items) {
        const url = (item.url || '').trim();
        const name = (item.name || '').trim() || url;
        if (!isValidUrl(url)) { skipped++; continue; }
        const catelogId = categoryCache.get(normalizeFolderPath(item.folderPath));
        if (existingUrls.has(url)) {
          updateStmts.push(db.prepare('UPDATE sites SET name = ?, catelog_id = ?, update_time = CURRENT_TIMESTAMP WHERE url = ?').bind(name, catelogId, url));
          updated++;
        } else {
          insertStmts.push(db.prepare('INSERT INTO sites (name, url, logo, desc, catelog_id, sort_order) VALUES (?, ?, ?, ?, ?, ?)')
            .bind(name, url, logoFor(url, env), null, catelogId, normalizeSortOrder(9999)));
          added++;
        }
      }
      for (let i = 0; i < insertStmts.length; i += BATCH_SIZE) await db.batch(insertStmts.slice(i, i + BATCH_SIZE));
      for (let i = 0; i < updateStmts.length; i += BATCH_SIZE) await db.batch(updateStmts.slice(i, i + BATCH_SIZE));
      return corsJson({ code: 200, message: `同步完成：新增 ${added} 个，更新 ${updated} 个，跳过 ${skipped} 个`, data: { added, updated, skipped } });
    }

    // ---- 单条 ----
    const action = (body?.action || 'upsert').trim();
    if (action === 'delete') {
      const deleted = await deleteByUrl(body.url || body.oldUrl);
      return corsJson({ code: 200, message: deleted ? '已删除 1 个书签' : '导航站里没有这个书签，无需删除', data: { deleted } });
    }
    if (action === 'move') {
      // 移动只改分类：按 URL 找，找不到就按标题+链接新建一条
      const url = (body.url || '').trim();
      if (!isValidUrl(url)) return corsError('move 需要合法的 url', 400);
      const catelogId = await resolveCategoryId(body.folderPath);
      const existing = await db.prepare('SELECT id FROM sites WHERE url = ?').bind(url).first();
      if (existing) {
        await db.prepare('UPDATE sites SET catelog_id = ?, update_time = CURRENT_TIMESTAMP WHERE id = ?').bind(catelogId, existing.id).run();
        return corsJson({ code: 200, message: '已移动到新分类', data: { updated: 1 } });
      }
      const r = await upsertOne(body);
      return corsJson({ code: 200, message: '原书签不在导航站，已按新分类新建', data: r });
    }
    if (action === 'upsert' || action === 'update' || action === 'create') {
      const r = await upsertOne(body);
      return corsJson({ code: 200, message: r.added ? '已同步到导航站' : r.updated ? '已更新导航站里的书签' : '已跳过（链接无效）', data: r });
    }
    return corsError(`不支持的 action：${action}，可用 upsert / update / move / delete / batch`, 400);
  } catch (e) {
    return corsError(`同步失败：${e.message}`, 500);
  }
}
