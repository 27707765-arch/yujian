/**
 * 响应工具函数模块
 * 用于标准化API响应格式，提供统一的成功和错误响应处理
 * 
 * 包含三个核心函数：
 * - success: 处理成功响应
 * - error: 处理客户端错误响应
 * - serverError: 处理服务器内部错误响应
 */

/**
 * 成功响应
 * @param {Object} res - Express响应对象
 * @param {Object|null} data - 响应数据，默认为null
 * @param {string} message - 响应消息，默认为'success'
 * @returns {Object} - 格式化的成功响应
 */
function success(res, data = null, message = 'success') {
  return res.status(200).json({
    code: 0, // 成功状态码
    message, // 响应消息
    data     // 响应数据
  });
}

/**
 * 错误响应
 * @param {Object} res - Express响应对象
 * @param {number} statusCode - HTTP状态码，默认为400
 * @param {string} message - 错误消息，默认为'请求失败'
 * @param {number} code - 业务错误码，默认为400
 * @returns {Object} - 格式化的错误响应
 */
function error(res, statusCode = 400, message = '请求失败', code = 400) {
  return res.status(statusCode).json({
    code,    // 业务错误码
    message, // 错误消息
    data: null // 错误响应无数据
  });
}

/**
 * 服务器错误响应
 * @param {Object} res - Express响应对象
 * @param {Error} err - 错误对象
 * @param {string} message - 错误消息，默认为'服务器内部错误'
 * @returns {Object} - 格式化的服务器错误响应
 */
function serverError(res, err, message = '服务器内部错误') {
  // 记录错误信息到控制台
  console.error(message + ':', err);
  
  return res.status(500).json({
    code: 500, // 服务器错误状态码
    message,   // 错误消息
    data: null // 错误响应无数据
  });
}

module.exports = {
  success,  // 成功响应函数
  error,    // 错误响应函数
  serverError // 服务器错误响应函数
};
