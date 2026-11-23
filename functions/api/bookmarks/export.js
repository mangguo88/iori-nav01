// functions/api/bookmarks/export.js
// 导出全部书签：供扩展“从网站拉取到浏览器收藏夹”用（网站 -> 浏览器，单向）。
//
// 鉴权：与 /api/bookmarks/sync 用同一个 Bearer SYNC_TOKEN（扩展设置页里填的那个），
// 不走 admin_session Cookie。SYNC_TOKEN 未配置时返回 503。
//
// GET 返回：{ code: 200, data: { total, bookmarks: [{ id, name, url, desc, folderPath, sort_order }] } }
// folderPath：相对收藏夹栏的路径，如 "VPS类 / 面板项目地址"；根目录书签为空字符串。
// desc 原样返回（没有就是 null）；扩展拉取时再决定要不要缀到标题后面。
// 含私密书签（调用方是站长自己的扩展），按 sort_order 排序，分批查避免 D1 单次行数限制。

import { errorResponse, jsonResponse } from '../../_middleware';

const TOP_LEVEL_FOLDERS = new Set([
  '书签栏', 'Bookmarks Bar', 'Bookmarks bar',
  '其他书签', 'Other Bookmarks', 'Other bookmarks',
  '移动设备书签', 'Mobile Bookmarks',
  '书签', '所有书签',
  '未分类',
  // 网站侧根分类就叫“收藏夹栏”（浏览器侧叫书签栏/Bookmarks Bar），导出时也要去掉，
  // 否则扩展会在收藏夹栏下再建一个同名文件夹，结构套两层。
  '收藏夹栏',
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

// "收藏夹栏 / VPS类 / 面板项目地址" -> "VPS类 / 面板项目地址"；
// 只有顶层、"未分类"或空 -> ""（扩展放到收藏夹栏根目录）。
function toRelativeFolderPath(catelog) {
  if (!catelog || typeof catelog !== 'string') return '';
  const parts = catelog.split('/').map((s) => s.trim()).filter((s) => s && !TOP_LEVEL_FOLDERS.has(s));
  return parts.join(' / ');
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const auth = checkToken(request, env);
  if (!auth.ok) return corsError(auth.message, auth.status);
  if (!env.NAV_DB) return corsError('NAV_DB 未绑定', 500);

  const db = env.NAV_DB;
  const PAGE = 500;
  const bookmarks = [];
  let offset = 0;
  try {
    for (;;) {
      const { results } = await db.prepare(
        `SELECT s.id, s.name, s.url, s.desc, s.sort_order, c.catelog
         FROM sites s LEFT JOIN category c ON s.catelog_id = c.id
         ORDER BY s.sort_order ASC, s.id ASC LIMIT ? OFFSET ?`
      ).bind(PAGE, offset).all();
      const rows = results || [];
      for (const r of rows) {
        bookmarks.push({
          id: r.id,
          name: r.name || r.url || '',
          url: r.url || '',
          desc: r.desc || null,
          folderPath: toRelativeFolderPath(r.catelog),
          sort_order: r.sort_order,
        });
      }
      if (rows.length < PAGE) break;
      offset += PAGE;
    }
    return corsJson({ code: 200, data: { total: bookmarks.length, bookmarks } });
  } catch (e) {
    return corsError(`导出失败：${e.message}`, 500);
  }
}
