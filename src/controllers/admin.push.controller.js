/**
 * 推送管理 + 数据统计控制器
 */
const { executeQuery } = require('../utils/database');
const pushService = require('../services/push.service');
const { success, error, serverError } = require('../utils/response');

// ===== 推送管理 =====
async function sendPush(req, res) {
  try {
    const { title, content, target_type, target_condition } = req.body;
    if (!title || !content) return error(res, 400, '标题和内容不能为空');

    // 根据目标类型解析用户ID列表
    let userIds = [];
    try {
      if (target_type === 'active') {
        const [rows] = await executeQuery(
          'SELECT DISTINCT user_id FROM user_behaviors WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) LIMIT 500'
        );
        userIds = rows.map(r => r.user_id);
      } else {
        const [rows] = await executeQuery('SELECT id FROM users WHERE status = 1 LIMIT 1000');
        userIds = rows.map(r => r.id);
      }
    } catch (e) { /* 查询失败时静默，保持空列表 */ }

    const [r] = await executeQuery(
      'INSERT INTO push_records_adm (title, content, target_type, target_count, status, created_by) VALUES (?,?,?,?,?,?)',
      [title, content, target_type || 'all', userIds.length, 'sending', req.user.id]
    );

    // 实际推送（在线用户走 WS 实时收到）
    let result = { total: 0, success: 0, failed: 0 };
    if (userIds.length > 0) {
      result = await pushService.sendBatchPush(userIds, {
        title, body: content, pushType: pushService.PUSH_TYPES.SYSTEM
      });
    }

    // 回写发送统计
    await executeQuery(
      'UPDATE push_records_adm SET sent_count=?, status=?, sent_at=NOW() WHERE id=?',
      [result.success, result.failed > 0 ? 'partial' : 'sent', r.insertId]
    );

    success(res, { id: r.insertId, ...result }, '推送任务已发送');
  } catch (err) { serverError(res, err, '创建推送失败'); }
}

async function getPushHistory(req, res) {
  try { const [r] = await executeQuery('SELECT * FROM push_records_adm ORDER BY created_at DESC LIMIT 50'); success(res, r); }
  catch (err) { serverError(res, err, '获取推送历史失败'); }
}

async function getTemplates(req, res) {
  try { const [r] = await executeQuery('SELECT * FROM push_templates ORDER BY created_at DESC'); success(res, r); }
  catch (err) { serverError(res, err, '获取模板失败'); }
}

async function createTemplate(req, res) {
  try {
    const { name, title, content, variables } = req.body;
    const [r] = await executeQuery('INSERT INTO push_templates (name, title, content, variables) VALUES (?,?,?,?)', [name, title, content, JSON.stringify(variables || [])]);
    success(res, { id: r.insertId }, '模板已创建');
  } catch (err) { serverError(res, err, '创建模板失败'); }
}

async function deleteTemplate(req, res) {
  try { await executeQuery('DELETE FROM push_templates WHERE id=?', [parseInt(req.params.id)]); success(res, null, '已删除'); }
  catch (err) { serverError(res, err, '删除模板失败'); }
}

// ===== 数据统计 =====
async function getUserTrend(req, res) {
  try {
    const [r] = await executeQuery("SELECT DATE(created_at) as dt, COUNT(*) as cnt FROM users GROUP BY dt ORDER BY dt DESC LIMIT 30");
    success(res, r);
  } catch (err) { serverError(res, err, '获取用户趋势失败'); }
}

async function getRevenueTrend(req, res) {
  try {
    const [r] = await executeQuery("SELECT DATE(created_at) as dt, SUM(amount) as total FROM coin_transactions WHERE type='recharge' GROUP BY dt ORDER BY dt DESC LIMIT 30");
    success(res, r);
  } catch (err) { serverError(res, err, '获取营收趋势失败'); }
}

async function getMatchStats(req, res) {
  try {
    const [[{ total }]] = await executeQuery('SELECT COUNT(*) as total FROM matches');
    const [[{ today }]] = await executeQuery('SELECT COUNT(*) as today FROM matches WHERE DATE(created_at) = CURDATE()');
    success(res, { total, today });
  } catch (err) { serverError(res, err, '获取匹配统计失败'); }
}

module.exports = { sendPush, getPushHistory, getTemplates, createTemplate, deleteTemplate, getUserTrend, getRevenueTrend, getMatchStats };
