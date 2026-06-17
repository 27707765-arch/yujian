/**
 * 限流中间件
 * 用于限制API请求频率，防止恶意请求和DoS攻击
 * 支持Redis和内存存储两种方式，当Redis不可用时自动降级到内存存储
 */

const redis = require('../config/redis');

// 内存存储（当Redis不可用时使用）
const memoryStore = new Map();

/**
 * 清理过期的内存记录
 * 定期清理内存中过期的限流记录，避免内存泄漏
 */
function cleanupMemoryStore() {
  const now = Date.now();
  for (const [key, data] of memoryStore.entries()) {
    if (now > data.resetTime) {
      memoryStore.delete(key);
    }
  }
}

/**
 * 限流中间件工厂函数
 * @param {Object} options - 配置选项
 * @param {number} options.windowMs - 时间窗口大小（毫秒），默认为900000（15分钟）
 * @param {number} options.max - 时间窗口内最大请求次数，默认为100
 * @param {string} options.message - 限流时的错误消息，默认为'请求过于频繁，请稍后再试'
 * @param {Function} options.keyGenerator - 生成限流键的函数，默认为使用IP地址
 * @returns {Function} - Express中间件函数
 */
function rateLimit(options = {}) {
  // 解构并设置默认值
  const {
    windowMs = 900000, // 15分钟
    max = 100, // 每个IP在windowMs时间内最多请求次数
    message = '请求过于频繁，请稍后再试',
    keyGenerator = (req) => req.ip, // 默认使用IP作为限流键
    keyPrefix = 'rate_limit' // 键前缀，区分不同限流实例
  } = options;

  /**
   * 限流中间件函数
   * @param {Object} req - Express请求对象
   * @param {Object} res - Express响应对象
   * @param {Function} next - 下一个中间件函数
   * @returns {Object|undefined} - 超过限制时返回错误响应，否则调用next()
   */
  return async (req, res, next) => {
    try {
      // 生成限流键
      const key = keyGenerator(req);
      
      // 尝试使用Redis
      const redisAvailable = await redis.ensureConnected();
      
      if (redisAvailable) {
        const client = redis.getClient();
        
        // 获取当前计数（使用 keyPrefix 区分不同限流实例）
        const current = await client.get(`${keyPrefix}:${key}`);
        
        if (current) {
          // 如果计数存在且超过限制
          if (parseInt(current) >= max) {
            return res.status(429).json({
              code: 429,
              message: message,
              data: null
            });
          }
          // 增加计数
          await client.incr(`${keyPrefix}:${key}`);
        } else {
          // 首次请求，设置计数为1并设置过期时间
          await client.set(`${keyPrefix}:${key}`, 1, { EX: Math.ceil(windowMs / 1000) });
        }
      } else {
        // 使用内存限流（降级方案）
        cleanupMemoryStore();
        
        const now = Date.now();
        const namespacedKey = `${keyPrefix}:${key}`;
        const record = memoryStore.get(namespacedKey);

        if (record) {
          if (now > record.resetTime) {
            // 重置计数
            memoryStore.set(namespacedKey, { count: 1, resetTime: now + windowMs });
          } else if (record.count >= max) {
            // 超过限制
            return res.status(429).json({
              code: 429,
              message: message,
              data: null
            });
          } else {
            // 增加计数
            record.count++;
          }
        } else {
          // 首次请求
          memoryStore.set(namespacedKey, { count: 1, resetTime: now + windowMs });
        }
      }
      
      // 继续处理请求
      next();
    } catch (error) {
      // 记录错误
      console.error('限流中间件错误:', error.message);
      // 如果出错，允许请求通过，不影响正常服务
      next();
    }
  };
}

/**
 * 基于用户ID的限流
 * @param {Object} options - 配置选项
 * @returns {Function} - Express中间件函数
 */
function userRateLimit(options = {}) {
  return rateLimit({
    ...options,
    keyGenerator: (req) => req.user ? `user:${req.user.id}` : req.ip
  });
}

module.exports = {
  rateLimit,     // 通用限流中间件
  userRateLimit  // 基于用户ID的限流中间件
};