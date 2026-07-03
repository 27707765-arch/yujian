/**
 * 管理员权限中间件
 * 用于校验请求用户是否为管理员
 */

const authMiddleware = require('./auth');

/**
 * 管理员权限中间件
 * 复用 authMiddleware 进行JWT验证，然后额外检查admin角色
 */
function adminAuth(req, res, next) {
  authMiddleware(req, res, () => {
    // JWT验证通过，检查管理员角色
    if (!req.user || !req.user.role || req.user.role !== 'admin') {
      return res.status(403).json({
        code: 403,
        message: '无权限访问，仅限管理员操作',
        data: null
      });
    }
    next();
  });
}

module.exports = { adminAuth };
