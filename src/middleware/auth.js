/**
 * JWT认证中间件
 * 用于验证用户的JWT token，确保只有认证用户才能访问受保护的路由
 */

const jwt = require('jsonwebtoken');
const { error } = require('../utils/response');
const { ErrorCodes } = require('../utils/errorCodes');

// 缓存当前进程内已校验过 status 的用户ID（TTL 60s），避免每个请求都查库
const _statusCheckCache = new Map();

/**
 * JWT认证中间件函数
 * @param {Object} req - Express请求对象
 * @param {Object} res - Express响应对象
 * @param {Function} next - 下一个中间件函数
 * @returns {Object|undefined} - 验证失败时返回错误响应，成功时调用next()
 */
async function authMiddleware(req, res, next) {
  try {
    // 从请求头获取Authorization头
    const authHeader = req.headers.authorization;

    // 检查Authorization头是否存在且格式正确
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return error(res, 401, '未授权，请登录', ErrorCodes.AUTH_REQUIRED);
    }

    // 提取token
    const token = authHeader.split(' ')[1];

    // 验证token
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_jwt_secret_key');

    // 将解码后的用户信息存储到请求对象中
    req.user = decoded;

    // 账号状态检查：注销/禁用后 token 即使未过期也立即拒绝（60s进程内缓存避免高频查库）
    const uid = decoded.id;
    const now = Date.now();
    const cached = _statusCheckCache.get(uid);
    if (cached && now - cached.ts < 60000) {
      if (!cached.active) return error(res, 403, '账号已注销或已被禁用', ErrorCodes.AUTH_ACCOUNT_DISABLED);
    } else {
      try {
        const User = require('../models/User');
        const user = await User.findById(uid);
        const active = !!user && user.status === 1;
        _statusCheckCache.set(uid, { active, ts: Date.now() });
        if (!active) return error(res, 403, '账号已注销或已被禁用', ErrorCodes.AUTH_ACCOUNT_DISABLED);
      } catch (dbErr) {
        // 状态查询失败则放行，避免误伤正常用户（下次请求再试）
      }
    }

    // 继续处理请求
    next();
  } catch (err) {
    // 处理token过期错误
    if (err.name === 'TokenExpiredError') {
      return error(res, 401, 'Token已过期，请重新登录', ErrorCodes.AUTH_TOKEN_EXPIRED);
    }
    // 处理其他token错误
    return error(res, 401, 'Token无效，请重新登录', ErrorCodes.AUTH_TOKEN_INVALID);
  }
}

module.exports = authMiddleware;