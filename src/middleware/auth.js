/**
 * JWT认证中间件
 * 用于验证用户的JWT token，确保只有认证用户才能访问受保护的路由
 */

const jwt = require('jsonwebtoken');
const { error } = require('../utils/response');
const { ErrorCodes } = require('../utils/errorCodes');

/**
 * JWT认证中间件函数
 * @param {Object} req - Express请求对象
 * @param {Object} res - Express响应对象
 * @param {Function} next - 下一个中间件函数
 * @returns {Object|undefined} - 验证失败时返回错误响应，成功时调用next()
 */
function authMiddleware(req, res, next) {
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