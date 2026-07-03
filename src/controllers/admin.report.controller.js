/**
 * 管理员 - 举报管理控制器
 * 查看所有举报、处理举报
 */

const { executeQuery } = require('../utils/database');
const { success, error, serverError } = require('../utils/response');

function safeRows(result) {
  if (!result || !Array.isArray(result)) return [];
  return result;
}

function safeFirst(result, defaultValue = {}) {
  if (!result || !Array.isArray(result) || result.length === 0) return defaultValue;
  return result[0] || defaultValue;
}

/**
 * 获取举报列表
 * GET /api/admin/reports?status=0&limit=20&offset=0
 */
async function getReportList(req, res) {
  try {
    const { status = 0, limit = 20, offset = 0 } = req.query;

    const query = `SELECT r.*,
      reporter.nickname as reporter_nickname, reporter.avatar as reporter_avatar,
      reported.nickname as reported_nickname, reported.avatar as reported_avatar, reported.status as reported_status
      FROM reports r
      LEFT JOIN users reporter ON r.reporter_id = reporter.id
      LEFT JOIN users reported ON r.reported_user_id = reported.id
      WHERE r.status = ? ORDER BY r.created_at DESC LIMIT ? OFFSET ?`;

    const reports = safeRows(await executeQuery(query, [parseInt(status, 10), parseInt(limit, 10), parseInt(offset, 10)]));

    const total = safeFirst(
      await executeQuery('SELECT COUNT(*) as total FROM reports WHERE status = ?', [parseInt(status, 10)]),
      { total: 0 }
    ).total;

    // 统计各状态数量
    const pendingCount = safeFirst(
      await executeQuery('SELECT COUNT(*) as total FROM reports WHERE status = 0'),
      { total: 0 }
    ).total;
    const handledCount = safeFirst(
      await executeQuery('SELECT COUNT(*) as total FROM reports WHERE status = 1'),
      { total: 0 }
    ).total;

    success(res, { reports, total, pending_count: pendingCount, handled_count: handledCount });
  } catch (err) {
    serverError(res, err, '获取举报列表失败');
  }
}

/**
 * 处理举报
 * PUT /api/admin/reports/:id/handle
 * Body: { action: "ban" | "dismiss" }
 */
async function handleReport(req, res) {
  try {
    const reportId = parseInt(req.params.id, 10);
    if (isNaN(reportId)) return error(res, 400, '举报ID无效');

    const { action } = req.body;
    if (!action || !['ban', 'dismiss'].includes(action)) {
      return error(res, 400, '处理动作必须为 ban 或 dismiss');
    }

    const existing = safeFirst(await executeQuery('SELECT * FROM reports WHERE id = ?', [reportId]));
    if (!existing.id) return error(res, 404, '举报记录不存在');
    if (existing.status === 1) return error(res, 400, '该举报已处理');

    // 标记举报已处理
    await executeQuery('UPDATE reports SET status = 1 WHERE id = ?', [reportId]);

    // 如果是封号操作，禁用被举报用户
    if (action === 'ban') {
      await executeQuery('UPDATE users SET status = 0 WHERE id = ?', [existing.reported_user_id]);
    }

    success(res, null, action === 'ban' ? '已封禁被举报用户' : '已驳回举报');
  } catch (err) {
    serverError(res, err, '处理举报失败');
  }
}

module.exports = { getReportList, handleReport };
