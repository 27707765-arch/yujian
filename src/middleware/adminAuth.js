/**
 * 管理员权限中间件
 * 用于校验请求用户是否为管理员，并注入 req.admin（角色 + 权限）
 *
 * 增强点（相对原实现）：
 * 1. 校验 admin_users 表中该用户的 is_active 状态（停用后立即失效，60s TTL 缓存避免高频查库）
 * 2. 注入 req.admin = { id, admin_role, is_active, permissions(数组) }
 * 3. 新增 requirePerm(...perms) 工厂：路由级权限点校验
 * 4. 宽松回退：JWT role==='admin' 但 admin_users 无行时按 admin 默认权限放行，
 *    保证 DB 降级（executeQuery 返回空）与存量未灌入 admin_users 的环境不回归。
 */

const authMiddleware = require('./auth');
const { error } = require('../utils/response');
const { ErrorCodes } = require('../utils/errorCodes');
const { executeQuery } = require('../utils/database');
const { normalizePermissions, hasPermission, ROLE_PERMISSIONS } = require('../utils/permissions');

// 进程内已校验过的 admin 用户缓存（TTL 60s），避免每个请求都查库
const _adminCache = new Map();

/**
 * 管理员权限中间件
 * 复用 authMiddleware 进行JWT验证，然后检查 admin 角色与 admin_users 状态
 */
function adminAuth(req, res, next) {
  authMiddleware(req, res, () => {
    // JWT验证通过，检查管理员角色
    if (!req.user || !req.user.role || req.user.role !== 'admin') {
      return error(res, 403, '无权限访问，仅限管理员操作', ErrorCodes.AUTH_ADMIN_ONLY);
    }

    const uid = req.user.id;
    const now = Date.now();
    const cached = _adminCache.get(uid);
    if (cached && now - cached.ts < 60000) {
      // 缓存命中
      if (!cached.admin) {
        // 停用/删除 → 拒绝（宽松回退后 cached.admin 可能为 null）
        return error(res, 403, '管理员账号已停用', ErrorCodes.AUTH_FORBIDDEN);
      }
      req.admin = cached.admin;
      return next();
    }

    // 缓存未命中：查 admin_users 表
    executeQuery('SELECT id, user_id, admin_role, permissions, is_active FROM admin_users WHERE user_id = ?', [uid])
      .then((result) => {
        // executeQuery 返回 [rows, fields]，解包第一维
        const rows = Array.isArray(result) && Array.isArray(result[0]) ? result[0] : result;
        const row = (Array.isArray(rows) && rows[0]) || null;

        if (row) {
          if (row.is_active !== 1 && row.is_active !== '1') {
            // 管理员存在但已停用 → 拒绝并缓存
            _adminCache.set(uid, { admin: null, ts: Date.now() });
            return error(res, 403, '管理员账号已停用', ErrorCodes.AUTH_FORBIDDEN);
          }
          const admin = {
            id: row.id,
            user_id: row.user_id,
            admin_role: row.admin_role || 'operator',
            is_active: row.is_active,
            permissions: normalizePermissions(row.permissions, row.admin_role)
          };
          _adminCache.set(uid, { admin, ts: Date.now() });
          req.admin = admin;
          return next();
        }

        // 宽松回退：admin_users 无行（DB 降级 / 0003 未跑 / 存量 admin）
        // 按 admin 默认权限放行，避免全部 403 回归
        console.warn(`[adminAuth] 用户 ${uid} 为 admin 角色但 admin_users 无记录，按 admin 默认权限放行`);
        const fallback = {
          id: null,
          user_id: uid,
          admin_role: 'admin',
          is_active: 1,
          permissions: ROLE_PERMISSIONS.admin.slice()
        };
        _adminCache.set(uid, { admin: fallback, ts: Date.now() });
        req.admin = fallback;
        return next();
      })
      .catch((err) => {
        // 查询失败（如 DB 不可用）→ 宽松放行，避免误伤
        console.error('[adminAuth] 查询 admin_users 失败，按 admin 默认权限放行:', err.message);
        const fallback = {
          id: null,
          user_id: uid,
          admin_role: 'admin',
          is_active: 1,
          permissions: ROLE_PERMISSIONS.admin.slice()
        };
        _adminCache.set(uid, { admin: fallback, ts: Date.now() });
        req.admin = fallback;
        return next();
      });
  });
}

/**
 * 路由级权限点校验中间件工厂
 * @param {...string} perms - 所需权限点（任一满足即放行）
 * @returns {Function} express 中间件
 */
function requirePerm(...perms) {
  return function (req, res, next) {
    if (!req.admin) {
      return error(res, 403, '无权限执行该操作', ErrorCodes.AUTH_FORBIDDEN);
    }
    const ok = perms.some(p => hasPermission(req.admin, p));
    if (!ok) {
      return error(res, 403, '无权限执行该操作', ErrorCodes.AUTH_FORBIDDEN);
    }
    next();
  };
}

/**
 * 使某 admin 用户缓存立即失效（停用/改权限/删除后调用，无需等 60s TTL）
 * @param {number} uid - users.id
 */
adminAuth.invalidateAdminCache = function (uid) {
  if (uid !== undefined && uid !== null) _adminCache.delete(uid);
};

module.exports = { adminAuth, requirePerm };
