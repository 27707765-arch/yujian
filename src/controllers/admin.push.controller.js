/**
 * 推送管理 + 数据统计控制器
 */
const { executeQuery } = require('../utils/database');
const { success, error, serverError } = require('../utils/response');

// ===== 推送管理 =====
async function sendPush(req, res) {
  try {
    const { title, content, target_type, target_condition } = req.body;
    if (!title || !content) return error(res, 400, '标题和内容不能为空');
    const [r] = await executeQuery(
      'INSERT INTO push_records_adm (title, content, target_type, created_by) VALUES (?,?,?,?)',
      [title, content, target_type || 'all', req.user.id]
    );
    // TODO: 实际推送逻辑
    success(res, { id: r.insertId }, '推送任务已创建');
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
