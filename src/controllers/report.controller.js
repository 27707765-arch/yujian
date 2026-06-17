const { pool } = require('../config/database');
const { success, error, serverError } = require('../utils/response');

async function submitReport(req, res) {
  try {
    const { id } = req.user;
    const { reported_user_id, reason } = req.body;

    if (!reported_user_id || !reason) {
      return error(res, 400, '被举报用户ID和举报原因不能为空');
    }

    const [users] = await pool.execute('SELECT id FROM users WHERE id = ?', [reported_user_id]);
    if (users.length === 0) {
      return error(res, 404, '被举报用户不存在');
    }

    const [reports] = await pool.execute(
      'SELECT id FROM reports WHERE reporter_id = ? AND reported_user_id = ? AND status = 0',
      [id, reported_user_id]
    );
    if (reports.length > 0) {
      return error(res, 400, '已经举报过该用户，请勿重复举报');
    }

    const [result] = await pool.execute(
      'INSERT INTO reports (reporter_id, reported_user_id, reason) VALUES (?, ?, ?)',
      [id, reported_user_id, reason]
    );

    success(res, { report_id: result.insertId }, '举报成功，我们会尽快处理');
  } catch (err) {
    serverError(res, err, '提交举报失败');
  }
}

async function getReports(req, res) {
  try {
    const { status = 0, limit = 20, offset = 0 } = req.query;

    const [reports] = await pool.execute(
      `SELECT r.*, reporter.nickname as reporter_nickname, reported.nickname as reported_nickname
       FROM reports r
       LEFT JOIN users reporter ON r.reporter_id = reporter.id
       LEFT JOIN users reported ON r.reported_user_id = reported.id
       WHERE r.status = ? ORDER BY r.created_at DESC LIMIT ? OFFSET ?`,
      [parseInt(status), parseInt(limit), parseInt(offset)]
    );

    const [countResult] = await pool.execute(
      'SELECT COUNT(*) as count FROM reports WHERE status = ?', [parseInt(status)]
    );

    success(res, { reports, total: countResult[0].count });
  } catch (err) {
    serverError(res, err, '获取举报列表失败');
  }
}

async function handleReport(req, res) {
  try {
    const { id } = req.params;
    const { action } = req.body;

    if (!id || !action) {
      return error(res, 400, '举报ID和处理动作不能为空');
    }

    const [reports] = await pool.execute('SELECT * FROM reports WHERE id = ?', [id]);
    if (reports.length === 0) {
      return error(res, 404, '举报记录不存在');
    }

    await pool.execute('UPDATE reports SET status = 1 WHERE id = ?', [id]);

    if (action === 'ban') {
      await pool.execute('UPDATE users SET status = 0 WHERE id = ?', [reports[0].reported_user_id]);
    }

    success(res, null, '处理举报成功');
  } catch (err) {
    serverError(res, err, '处理举报失败');
  }
}

module.exports = { submitReport, getReports, handleReport };