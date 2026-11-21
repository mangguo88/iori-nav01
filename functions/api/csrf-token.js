// functions/api/csrf-token.js
// GET /api/csrf-token：仅管理员可调，返回当前会话的 CSRF token。
//
// 背景：全局中间件对所有 POST/PUT/DELETE /api/* 强制校验 X-CSRF-Token，
// 登录时 token 只存进 KV（csrf_<session>），从不发给浏览器；/admin 页由
// functions/admin/index.js 把它注入成 <meta name="csrf-token">。
// 但首页 HTML 是 KV 共享缓存，绝对不能把 token 注入进去（会进缓存等于公开）。
// 所以首页这类需要发写请求、又拿不到 meta 的页面，改调这个接口现取 token。
// token 只在已登录的管理员会话下返回，未登录返回 401。
import { isAdminAuthenticated, getSessionToken, errorResponse, jsonResponse } from '../_middleware';

export async function onRequestGet(context) {
  const { request, env } = context;

  if (!(await isAdminAuthenticated(request, env))) {
    return errorResponse('Unauthorized', 401);
  }

  const sessionToken = getSessionToken(request);
  const csrfToken = sessionToken ? await env.NAV_AUTH.get(`csrf_${sessionToken}`) : null;
  if (!csrfToken) {
    return errorResponse('CSRF token 不存在，请重新登录', 401);
  }

  return jsonResponse({ code: 200, csrfToken });
}
