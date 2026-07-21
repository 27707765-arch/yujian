/**
 * 内容审核控制器 - 敏感词管理 + 审核队列
 */
const { executeQuery } = require('../utils/database');
const { success, error, serverError } = require('../utils/response');

// ===== 敏感词管理 =====
async function getSensitiveWords(req, res) {
  try {
    const { limit = 50, offset = 0 } = req.query;
    const [rows] = await executeQuery('SELECT * FROM sensitive_words ORDER BY id DESC LIMIT ? OFFSET ?', [parseInt(limit), parseInt(offset)]);
    const [[{ total }]] = await executeQuery('SELECT COUNT(*) as total FROM sensitive_words');
    success(res, { list: rows, total });
  } catch (err) { serverError(res, err, '获取敏感词失败'); }
}

async function createSensitiveWord(req, res) {
  try {
    const { word, category, level } = req.body;
    if (!word) return error(res, 400, '敏感词不能为空');
    await executeQuery('INSERT INTO sensitive_words (word, category, level) VALUES (?,?,?)', [word, category || 'general', level || 1]);
    success(res, null, '添加成功');
  } catch (err) { err.code === 'ER_DUP_ENTRY' ? error(res, 400, '该敏感词已存在') : serverError(res, err, '添加敏感词失败'); }
}

async function updateSensitiveWord(req, res) {
  try {
    const { word, category, level, is_active } = req.body;
    await executeQuery('UPDATE sensitive_words SET word=?, category=?, level=?, is_active=? WHERE id=?', [word, category, level, is_active, parseInt(req.params.id)]);
    success(res, null, '更新成功');
  } catch (err) { serverError(res, err, '更新敏感词失败'); }
}

async function deleteSensitiveWord(req, res) {
  try {
    await executeQuery('DELETE FROM sensitive_words WHERE id = ?', [parseInt(req.params.id)]);
    success(res, null, '删除成功');
  } catch (err) { serverError(res, err, '删除敏感词失败'); }
}

async function batchImportSensitiveWords(req, res) {
  try {
    const { words } = req.body;
    if (!Array.isArray(words) || words.length === 0) return error(res, 400, '请提供敏感词列表');
    let count = 0;
    for (const w of words) {
      try { await executeQuery('INSERT INTO sensitive_words (word) VALUES (?)', [w]); count++; } catch(e) {}
    }
    success(res, { imported: count }, `成功导入${count}个敏感词`);
  } catch (err) { serverError(res, err, '批量导入失败'); }
}

// ===== 审核队列 =====
async function getAuditQueue(req, res) {
  try {
    const { type, status, limit = 20, offset = 0 } = req.query;
    let sql = 'SELECT * FROM audit_logs WHERE 1=1'; const params = [];
    if (type) { sql += ' AND content_type = ?'; params.push(type); }
    if (status) { sql += ' AND audit_result = ?'; params.push(status); }
    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));
    const [rows] = await executeQuery(sql, params);
    success(res, rows);
  } catch (err) { serverError(res, err, '获取审核队列失败'); }
}

async function approveContent(req, res) {
  try { await executeQuery('UPDATE audit_logs SET audit_result=?, auditor_id=?, audited_at=NOW() WHERE id=?', ['pass', req.user.id, parseInt(req.params.id)]); success(res, null, '审核通过'); }
  catch (err) { serverError(res, err, '审核失败'); }
}

async function rejectContent(req, res) {
  try { await executeQuery('UPDATE audit_logs SET audit_result=?, reject_reason=?, auditor_id=?, audited_at=NOW() WHERE id=?', ['reject', req.body.reason || '', req.user.id, parseInt(req.params.id)]); success(res, null, '已拒绝'); }
  catch (err) { serverError(res, err, '审核失败'); }
}

async function getAuditStats(req, res) {
  try {
    const [rows] = await executeQuery("SELECT content_type, audit_result, COUNT(*) as cnt FROM audit_logs GROUP BY content_type, audit_result");
    success(res, rows);
  } catch (err) { serverError(res, err, '获取统计失败'); }
}

module.exports = { getSensitiveWords, createSensitiveWord, updateSensitiveWord, deleteSensitiveWord, batchImportSensitiveWords, getAuditQueue, approveContent, rejectContent, getAuditStats };
