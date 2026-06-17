/**
 * 管理员权限中间件
 * 用于校验请求用户是否为管理员
 */

const jwt = require('jsonwebtoken');

function adminAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        code: 401,
        message: '未授权，请登录',
        data: null
      });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_jwt_secret_key');

    // 检查用户是否为管理员（通过 role 字段判断）
    if (!decoded.role || decoded.role !== 'admin') {
      return res.status(403).json({
        code: 403,
        message: '无权限访问，仅限管理员操作',
        data: null
      });
    }

    req.user = decoded;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        code: 401,
        message: 'Token已过期，请重新登录',
        data: null
      });
    }
    return res.status(401).json({
      code: 401,
      message: 'Token无效',
      data: null
    });
  }
}

module.exports = { adminAuth };
