/**
 * 业务错误码体系
 * 统一错误码定义，便于前后端对接和问题排查
 *
 * 编码规则：4位数字
 * - 1xxx: 认证/授权相关
 * - 2xxx: 用户/资料相关
 * - 3xxx: 资源/数据相关
 * - 4xxx: 订单/支付相关
 * - 5xxx: 系统/服务相关
 */

const ErrorCodes = {
  // ==================== 通用 ====================
  SUCCESS: 0,
  UNKNOWN_ERROR: 9999,

  // ==================== 1xxx: 认证/授权 ====================
  AUTH_REQUIRED: 1001,            // 未登录
  AUTH_TOKEN_EXPIRED: 1002,       // Token已过期
  AUTH_TOKEN_INVALID: 1003,       // Token无效
  AUTH_PHONE_FORMAT: 1101,        // 手机号格式错误
  AUTH_CODE_REQUIRED: 1102,       // 验证码不能为空
  AUTH_CODE_INVALID: 1103,        // 验证码错误
  AUTH_CODE_FREQUENT: 1104,       // 验证码发送过于频繁
  AUTH_LOGIN_FREQUENT: 1105,      // 登录尝试过于频繁
  AUTH_ACCOUNT_DISABLED: 1201,    // 账号已被禁用
  AUTH_REGISTER_DENIED: 1202,     // 注册受限
  AUTH_FORBIDDEN: 1301,           // 无权限访问
  AUTH_ADMIN_ONLY: 1302,          // 仅限管理员操作

  // ==================== 2xxx: 用户/资料 ====================
  USER_NOT_FOUND: 2001,           // 用户不存在
  USER_NICKNAME_INVALID: 2101,    // 昵称格式错误（2-50字符）
  USER_BIO_TOO_LONG: 2102,        // 个人简介过长（最多500字符）
  USER_TAGS_TOO_MANY: 2103,       // 标签数量超限（最多10个）
  USER_PHOTO_LIMIT: 2201,         // 相册照片数量已满（最多9张）
  USER_GENDER_INVALID: 2301,      // 性别值无效
  USER_AGE_INVALID: 2302,         // 年龄范围无效
  USER_HEIGHT_INVALID: 2303,      // 身高范围无效

  // ==================== 3xxx: 资源/数据 ====================
  RESOURCE_NOT_FOUND: 3001,       // 资源不存在
  POST_NOT_FOUND: 3101,           // 动态不存在
  POST_DELETED: 3102,             // 动态已删除
  COMMENT_NOT_FOUND: 3111,        // 评论不存在
  GIFT_NOT_FOUND: 3201,           // 礼物不存在
  GIFT_INACTIVE: 3202,            // 礼物已下架
  CONVERSATION_NOT_FOUND: 3301,   // 会话不存在
  MESSAGE_NOT_FOUND: 3302,        // 消息不存在
  REPORT_NOT_FOUND: 3401,         // 举报记录不存在
  REPORT_DUPLICATE: 3402,         // 重复举报
  PACKAGE_NOT_FOUND: 3501,        // 套餐不存在
  PACKAGE_INVALID: 3502,          // 套餐数据异常
  MATCH_DUPLICATE: 3601,          // 已匹配过该用户
  LIKE_DUPLICATE: 3602,           // 已喜欢过该用户

  // ==================== 4xxx: 订单/支付 ====================
  ORDER_CREATE_FAILED: 4001,      // 订单创建失败
  ORDER_NOT_FOUND: 4002,          // 订单不存在
  PAYMENT_REQUIRED: 4101,         // 需要完成支付
  WALLET_BALANCE_LOW: 4201,       // 余额不足
  WALLET_AMOUNT_INVALID: 4202,    // 充值金额无效
  CHECKIN_ALREADY: 4301,          // 今日已签到

  // ==================== 5xxx: 系统/服务 ====================
  DB_UNAVAILABLE: 5001,           // 数据库不可用
  REDIS_UNAVAILABLE: 5002,        // Redis不可用
  UPLOAD_FAILED: 5101,            // 文件上传失败
  UPLOAD_TYPE_INVALID: 5102,      // 文件类型不支持
  UPLOAD_SIZE_EXCEED: 5103,       // 文件大小超限
  RATE_LIMITED: 5201,             // 请求过于频繁
  REQUEST_TIMEOUT: 5301,          // 请求超时
  SERVER_ERROR: 5501,             // 服务器内部错误
};

/**
 * 获取错误码对应的默认消息
 * @param {number} code - 错误码
 * @returns {string}
 */
function getDefaultMessage(code) {
  const messages = {
    [ErrorCodes.AUTH_REQUIRED]: '请先登录',
    [ErrorCodes.AUTH_TOKEN_EXPIRED]: '登录已过期，请重新登录',
    [ErrorCodes.AUTH_TOKEN_INVALID]: 'Token无效，请重新登录',
    [ErrorCodes.AUTH_PHONE_FORMAT]: '手机号格式错误',
    [ErrorCodes.AUTH_CODE_INVALID]: '验证码错误',
    [ErrorCodes.AUTH_CODE_FREQUENT]: '验证码发送过于频繁，请稍后再试',
    [ErrorCodes.AUTH_ACCOUNT_DISABLED]: '账号已被禁用，请联系客服',
    [ErrorCodes.AUTH_FORBIDDEN]: '无权限访问',
    [ErrorCodes.AUTH_ADMIN_ONLY]: '仅限管理员操作',
    [ErrorCodes.RESOURCE_NOT_FOUND]: '资源不存在',
    [ErrorCodes.GIFT_NOT_FOUND]: '礼物不存在',
    [ErrorCodes.GIFT_INACTIVE]: '礼物已下架',
    [ErrorCodes.WALLET_BALANCE_LOW]: '金币不足，请充值',
    [ErrorCodes.WALLET_AMOUNT_INVALID]: '请选择有效的充值金额',
    [ErrorCodes.PACKAGE_NOT_FOUND]: '套餐不存在',
    [ErrorCodes.PACKAGE_INVALID]: '套餐数据异常',
    [ErrorCodes.RATE_LIMITED]: '请求过于频繁，请稍后再试',
    [ErrorCodes.SERVER_ERROR]: '服务器内部错误，请稍后重试',
  };
  return messages[code] || '操作失败';
}

module.exports = { ErrorCodes, getDefaultMessage };
