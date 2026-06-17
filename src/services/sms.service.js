/**
 * 短信服务（模拟实现）
 * 用于发送和验证短信验证码
 * 生产环境需替换为真实的短信服务商API
 */

const redis = require('../config/redis');

// 内存存储验证码（当Redis不可用时使用）
const memoryStore = new Map();

/**
 * 是否处于短信模拟模式
 * 当 SMS_SIMULATE=true 或 NODE_ENV=development 时，使用固定验证码并直接返回给客户端
 * 内测期间设置 SMS_SIMULATE=true 即可跳过真实短信服务
 */
function isSimulateMode() {
  return process.env.SMS_SIMULATE === 'true' || process.env.NODE_ENV === 'development';
}

/**
 * 生成随机验证码
 * @param {number} length - 验证码长度
 * @returns {string} - 验证码字符串
 */
function generateCode(length = 6) {
  // 模拟模式：使用固定验证码方便测试
  if (isSimulateMode()) {
    console.warn('⚠️  短信模拟模式：验证码固定为 123456');
    return '123456';
  }
  // 生产环境使用随机验证码（需对接真实短信服务商）
  let code = '';
  const chars = '0123456789';
  for (let i = 0; i < length; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/**
 * 清理过期的验证码
 */
function cleanupExpiredCodes() {
  const now = Date.now();
  for (const [key, data] of memoryStore.entries()) {
    if (now > data.expireTime) {
      memoryStore.delete(key);
    }
  }
}

/**
 * 发送验证码
 * @param {string} phone - 手机号
 * @returns {Promise<Object>} - 发送结果
 */
async function sendVerificationCode(phone) {
  try {
    // 生成验证码
    const code = generateCode();

    // 尝试连接Redis
    const redisAvailable = await redis.ensureConnected();

    if (redisAvailable) {
      // 存储验证码到Redis，设置5分钟过期
      const client = redis.getClient();
      await client.set(`sms:code:${phone}`, code, { EX: 300 });
    } else {
      // 使用内存存储（降级方案）
      cleanupExpiredCodes();
      memoryStore.set(phone, {
        code: code,
        expireTime: Date.now() + 5 * 60 * 1000 // 5分钟过期
      });
    }

    // 模拟短信发送（实际项目中需要调用真实的短信API）
    console.log(`[短信模拟] 向手机号 ${phone} 发送验证码：${code}`);

    return {
      success: true,
      message: '验证码发送成功',
      code: isSimulateMode() ? code : undefined // 仅模拟模式返回验证码，生产环境通过真实短信发送
    };
  } catch (err) {
    console.error('发送验证码失败:', err.message);
    return {
      success: false,
      message: '验证码发送失败'
    };
  }
}

/**
 * 验证验证码
 * @param {string} phone - 手机号
 * @param {string} code - 验证码
 * @returns {Promise<boolean>} - 验证是否通过
 */
async function verifyCode(phone, code) {
  try {
    // 尝试连接Redis
    const redisAvailable = await redis.ensureConnected();

    if (redisAvailable) {
      const client = redis.getClient();
      const storedCode = await client.get(`sms:code:${phone}`);

      if (storedCode === code) {
        // 验证成功后删除验证码
        await client.del(`sms:code:${phone}`);
        return true;
      }
      return false;
    } else {
      // 使用内存存储验证
      cleanupExpiredCodes();
      const record = memoryStore.get(phone);

      if (record && record.code === code) {
        // 验证成功后删除验证码
        memoryStore.delete(phone);
        return true;
      }
      return false;
    }
  } catch (err) {
    console.error('验证验证码失败:', err.message);
    return false;
  }
}

module.exports = {
  sendVerificationCode,
  verifyCode
};
