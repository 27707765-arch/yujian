/**
 * 管理员权限管理控制器
 */
const { executeQuery } = require('../utils/database');
const { success, error, serverError } = require('../utils/response');

const ROLE_PERMISSIONS = {
  super_admin: ['*'],
  admin: ['user_view','user_edit','user_ban','content_audit','report_handle','data_view','push_send'],
  operator: ['data_view','content_audit','push_send'],
  auditor: ['content_audit','verification_audit','report_handle'],
  cs: ['user_view','report_handle']
};

async function getAdminList(req, res) {
  try {
    const [rows] = await executeQuery(
      'SELECT au.*, u.nickname, u.phone FROM admin_users au LEFT JOIN users u ON au.user_id = u.id ORDER BY au.created_at DESC'
    );
    success(res, rows);
  } catch (err) { serverError(res, err, '获取管理员列表失败'); }
}

async function createAdmin(req, res) {
  try {
    const { user_id, admin_role, permissions } = req.body;
    if (!user_id || !admin_role) return error(res, 400, '参数不完整');
    await executeQuery('INSERT INTO admin_users (user_id, admin_role, permissions) VALUES (?,?,?) ON DUPLICATE KEY UPDATE admin_role=VALUES(admin_role), permissions=VALUES(permissions)',
      [user_id, admin_role, JSON.stringify(permissions || ROLE_PERMISSIONS[admin_role] || [])]);
    // 记录日志
    await executeQuery('INSERT INTO admin_operation_logs (admin_id, admin_name, action, target_type, target_id, ip) VALUES (?,?,?,?,?,?)',
      [req.user.id, 'admin', 'create_admin', 'user', user_id, req.ip]);
    success(res, null, '管理员已创建');
  } catch (err) { serverError(res, err, '创建管理员失败'); }
}

async function updateAdmin(req, res) {
  try {
    const { admin_role, permissions, is_active } = req.body;
    const updates = []; const vals = [];
    if (admin_role) { updates.push('admin_role=?'); vals.push(admin_role); }
    if (permissions) { updates.push('permissions=?'); vals.push(JSON.stringify(permissions)); }
    if (is_active !== undefined) { updates.push('is_active=?'); vals.push(is_active); }
    if (updates.length === 0) return error(res, 400, '无更新字段');
    vals.push(parseInt(req.params.id));
    await executeQuery(`UPDATE admin_users SET ${updates.join(',')} WHERE id=?`, vals);
    success(res, null, '已更新');
  } catch (err) { serverError(res, err, '更新管理员失败'); }
}

async function deleteAdmin(req, res) {
  try {
    await executeQuery('DELETE FROM admin_users WHERE id=? AND admin_role != ?', [parseInt(req.params.id), 'super_admin']);
    success(res, null, '已删除');
  } catch (err) { serverError(res, err, '删除管理员失败'); }
}

async function getOperationLogs(req, res) {
  try {
    const { limit = 50, offset = 0 } = req.query;
    const [rows] = await executeQuery('SELECT * FROM admin_operation_logs ORDER BY created_at DESC LIMIT ? OFFSET ?', [parseInt(limit), parseInt(offset)]);
    success(res, rows);
  } catch (err) { serverError(res, err, '获取日志失败'); }
}

module.exports = { getAdminList, createAdmin, updateAdmin, deleteAdmin, getOperationLogs };
