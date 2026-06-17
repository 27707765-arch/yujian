/**
 * JWT认证中间件
 * 用于验证用户的JWT token，确保只有认证用户才能访问受保护的路由
 */

const jwt = require('jsonwebtoken');

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
      return res.status(401).json({
        code: 401,
        message: '未授权，请登录',
        data: null
      });
    }
    
    // 提取token
    const token = authHeader.split(' ')[1];
    
    // 验证token
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_jwt_secret_key');
    
    // 将解码后的用户信息存储到请求对象中
    req.user = decoded;
    
    // 继续处理请求
    next();
  } catch (error) {
    // 处理token过期错误
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        code: 401,
        message: 'Token已过期，请重新登录',
        data: null
      });
    }
    // 处理其他token错误
    return res.status(401).json({
      code: 401,
      message: 'Token无效，请重新登录',
      data: null
    });
  }
}

module.exports = authMiddleware;