/**
 * 管理员权限管理控制器
 */
const { executeQuery } = require('../utils/database');
const { success, error, serverError } = require('../utils/response');
const { adminAuth } = require('../middleware/adminAuth');
const { ROLE_PERMISSIONS, normalizePermissions, getPermissionCatalog } = require('../utils/permissions');

/**
 * 获取当前管理员信息（权限初始化）
 * GET /api/admin/me
 * 读 adminAuth 注入的 req.admin，JOIN users 取昵称/手机号
 */
async function getMe(req, res) {
  try {
    const admin = req.admin || null;
    if (!admin) return error(res, 403, '无权限访问，仅限管理员操作');

    const uid = req.user ? req.user.id : admin.user_id;
    let nickname = null, phone = null;
    try {
      const result = await executeQuery('SELECT id, nickname, phone FROM users WHERE id = ?', [uid]);
      const rows = Array.isArray(result) && Array.isArray(result[0]) ? result[0] : result;
      if (rows && rows[0]) { nickname = rows[0].nickname; phone = rows[0].phone; }
    } catch (e) { /* 查询失败不影响权限下发 */ }

    success(res, {
      admin: {
        user_id: admin.user_id,
        admin_role: admin.admin_role,
        is_active: admin.is_active,
        permissions: admin.permissions
      },
      user: { id: uid, nickname, phone },
      role_permissions: ROLE_PERMISSIONS,
      permission_catalog: getPermissionCatalog()
    });
  } catch (err) {
    serverError(res, err, '获取管理员信息失败');
  }
}

async function getAdminList(req, res) {
  try {
    const [rows] = await executeQuery(
      'SELECT au.*, u.nickname, u.phone FROM admin_users au LEFT JOIN users u ON au.user_id = u.id ORDER BY au.created_at DESC'
    );
    // permissions 可能是字符串，归一化为数组
    rows.forEach(r => {
      if (typeof r.permissions === 'string') {
        try { r.permissions = JSON.parse(r.permissions); } catch (e) { r.permissions = null; }
      }
    });
    success(res, rows);
  } catch (err) { serverError(res, err, '获取管理员列表失败'); }
}

async function createAdmin(req, res) {
  try {
    const { user_id, admin_role, permissions } = req.body;
    if (!user_id || !admin_role) return error(res, 400, '参数不完整');
    const normalized = normalizePermissions(permissions, admin_role);
    await executeQuery('INSERT INTO admin_users (user_id, admin_role, permissions) VALUES (?,?,?) ON DUPLICATE KEY UPDATE admin_role=VALUES(admin_role), permissions=VALUES(permissions)',
      [user_id, admin_role, JSON.stringify(normalized)]);
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
    if (permissions !== undefined) {
      // 与 createAdmin 一致：按当前角色（或新角色）归一化
      const role = admin_role || (await getAdminRole(parseInt(req.params.id)));
      updates.push('permissions=?');
      vals.push(JSON.stringify(normalizePermissions(permissions, role)));
    }
    if (is_active !== undefined) { updates.push('is_active=?'); vals.push(is_active); }
    if (updates.length === 0) return error(res, 400, '无更新字段');
    vals.push(parseInt(req.params.id));
    await executeQuery(`UPDATE admin_users SET ${updates.join(',')} WHERE id=?`, vals);
    // 使缓存立即失效（停用/改权限即时生效）
    const target = await getAdminUser(parseInt(req.params.id));
    if (target) adminAuth.invalidateAdminCache(target.user_id);
    success(res, null, '已更新');
  } catch (err) { serverError(res, err, '更新管理员失败'); }
}

async function deleteAdmin(req, res) {
  try {
    const target = await getAdminUser(parseInt(req.params.id));
    await executeQuery('DELETE FROM admin_users WHERE id=? AND admin_role != ?', [parseInt(req.params.id), 'super_admin']);
    if (target) adminAuth.invalidateAdminCache(target.user_id);
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

// ===== 内部辅助 =====
async function getAdminRole(adminId) {
  try {
    const result = await executeQuery('SELECT admin_role FROM admin_users WHERE id = ?', [adminId]);
    const rows = Array.isArray(result) && Array.isArray(result[0]) ? result[0] : result;
    return (rows && rows[0] && rows[0].admin_role) || 'operator';
  } catch (e) { return 'operator'; }
}

async function getAdminUser(adminId) {
  try {
    const result = await executeQuery('SELECT user_id FROM admin_users WHERE id = ?', [adminId]);
    const rows = Array.isArray(result) && Array.isArray(result[0]) ? result[0] : result;
    return (rows && rows[0]) || null;
  } catch (e) { return null; }
}

module.exports = { getMe, getAdminList, createAdmin, updateAdmin, deleteAdmin, getOperationLogs };
