/**
 * 系统配置 + 公告管理控制器
 */
const { executeQuery } = require('../utils/database');
const { success, error, serverError } = require('../utils/response');

// ===== 系统配置 =====
async function getConfigs(req, res) {
  try {
    const [rows] = await executeQuery('SELECT * FROM system_configs ORDER BY category, config_key');
    success(res, rows);
  } catch (err) { serverError(res, err, '获取配置失败'); }
}

async function updateConfig(req, res) {
  try {
    const { config_value } = req.body;
    await executeQuery('UPDATE system_configs SET config_value=?, updated_by=? WHERE config_key=?', [config_value, req.user.id, req.params.key]);
    success(res, null, '配置已更新');
  } catch (err) { serverError(res, err, '更新配置失败'); }
}

// ===== 公告管理 =====
async function getAnnouncements(req, res) {
  try { const [r] = await executeQuery('SELECT * FROM announcements ORDER BY priority DESC, created_at DESC LIMIT 50'); success(res, r); }
  catch (err) { serverError(res, err, '获取公告失败'); }
}

async function createAnnouncement(req, res) {
  try {
    const { title, content, type, target_users, priority, start_time, end_time } = req.body;
    const [r] = await executeQuery(
      'INSERT INTO announcements (title, content, type, target_users, priority, start_time, end_time, created_by) VALUES (?,?,?,?,?,?,?,?)',
      [title, content, type || 'normal', target_users || 'all', priority || 0, start_time || null, end_time || null, req.user.id]
    );
    success(res, { id: r.insertId }, '公告已创建');
  } catch (err) { serverError(res, err, '创建公告失败'); }
}

async function updateAnnouncement(req, res) {
  try {
    const { title, content, type, target_users, priority, start_time, end_time } = req.body;
    await executeQuery(
      'UPDATE announcements SET title=?, content=?, type=?, target_users=?, priority=?, start_time=?, end_time=? WHERE id=?',
      [title, content, type, target_users, priority, start_time, end_time, parseInt(req.params.id)]
    );
    success(res, null, '公告已更新');
  } catch (err) { serverError(res, err, '更新公告失败'); }
}

async function deleteAnnouncement(req, res) {
  try { await executeQuery('DELETE FROM announcements WHERE id=?', [parseInt(req.params.id)]); success(res, null, '已删除'); }
  catch (err) { serverError(res, err, '删除失败'); }
}

async function publishAnnouncement(req, res) {
  try { await executeQuery("UPDATE announcements SET status='published' WHERE id=?", [parseInt(req.params.id)]); success(res, null, '已发布'); }
  catch (err) { serverError(res, err, '发布失败'); }
}

async function offlineAnnouncement(req, res) {
  try { await executeQuery("UPDATE announcements SET status='offline' WHERE id=?", [parseInt(req.params.id)]); success(res, null, '已下线'); }
  catch (err) { serverError(res, err, '下线失败'); }
}

module.exports = { getConfigs, updateConfig, getAnnouncements, createAnnouncement, updateAnnouncement, deleteAnnouncement, publishAnnouncement, offlineAnnouncement };
