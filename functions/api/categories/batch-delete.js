// functions/api/categories/batch-delete.js
// 批量删除分组：一次删一个或多个分组，递归包含它们下面的子分组，
// 以及这些分组里的书签和待审核书签。删了找不回来，调用前前端会二次确认。
// 注意：这只删导航站数据库里的数据，不删浏览器收藏夹里对应的收藏。
// 如果浏览器里那个文件夹还在，下次扩展点“立即同步全部书签”会把它重新推回来。
import { isAdminAuthenticated, errorResponse, jsonResponse, markHomeCacheDirty } from '../../_middleware';

const MAX_IDS = 100;
const CHUNK_SIZE = 50;

function chunked(ids) {
  const chunks = [];
  for (let i = 0; i < ids.length; i += CHUNK_SIZE) chunks.push(ids.slice(i, i + CHUNK_SIZE));
  return chunks;
}

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!(await isAdminAuthenticated(request, env))) {
    return errorResponse('Unauthorized', 401);
  }

  try {
    const body = await request.json();
    const rawIds = Array.isArray(body?.ids) ? body.ids : [];
    const ids = [...new Set(rawIds.map((v) => Number(v)).filter((v) => Number.isInteger(v) && v > 0))];

    if (ids.length === 0) {
      return errorResponse('未提供要删除的分组 ID', 400);
    }
    if (ids.length > MAX_IDS) {
      return errorResponse(`一次最多删除 ${MAX_IDS} 个分组`, 400);
    }

    // 先确认这些分组存在，并展开全部后代分组
    const placeholders = ids.map(() => '?').join(',');
    const { results: roots } = await env.NAV_DB.prepare(
      `SELECT id FROM category WHERE id IN (${placeholders})`
    ).bind(...ids).all();
    if (!roots || roots.length === 0) {
      return errorResponse('找不到要删除的分组', 404);
    }
    const rootIds = roots.map((r) => r.id);

    const { results: descendants } = await env.NAV_DB.prepare(
      `WITH RECURSIVE descendants(id) AS (
         SELECT id FROM category WHERE id IN (${placeholders})
         UNION ALL
         SELECT c.id FROM category c
         INNER JOIN descendants d ON c.parent_id = d.id
       )
       SELECT id FROM descendants`
    ).bind(...rootIds).all();
    const allCategoryIds = [...new Set((descendants || []).map((r) => r.id))];
    const subCount = allCategoryIds.length - rootIds.length;

    // 先数一下要连带删掉多少书签，写进返回里给前端显示
    let siteCount = 0;
    for (const chunk of chunked(allCategoryIds)) {
      const ph = chunk.map(() => '?').join(',');
      const row = await env.NAV_DB.prepare(
        `SELECT COUNT(*) AS n FROM sites WHERE catelog_id IN (${ph})`
      ).bind(...chunk).first();
      siteCount += row?.n || 0;
    }

    // 删：先删这些分组里的书签和待审核，再删分组本身
    const statements = [];
    for (const chunk of chunked(allCategoryIds)) {
      const ph = chunk.map(() => '?').join(',');
      statements.push(env.NAV_DB.prepare(`DELETE FROM sites WHERE catelog_id IN (${ph})`).bind(...chunk));
      statements.push(env.NAV_DB.prepare(`DELETE FROM pending_sites WHERE catelog_id IN (${ph})`).bind(...chunk));
      statements.push(env.NAV_DB.prepare(`DELETE FROM category WHERE id IN (${ph})`).bind(...chunk));
    }
    await env.NAV_DB.batch(statements);
    await markHomeCacheDirty(env, 'all');

    return jsonResponse({
      code: 200,
      message: `已删除 ${rootIds.length} 个分组（含 ${subCount} 个子分组）、${siteCount} 个书签`,
      data: { deletedCategories: allCategoryIds.length, deletedRootCategories: rootIds.length, deletedSubCategories: subCount, deletedSites: siteCount },
    });
  } catch (e) {
    return errorResponse(`批量删除分组失败: ${e.message}`, 500);
  }
}
