/**
 * 反欺诈与安全服务
 * 检测异常行为和批量注册
 */

const redis = require('../config/redis');
const { executeQuery, isDbAvailable } = require('../utils/database');

// 内存计数器（Redis 不可用时）
const memoryCounters = new Map();

/**
 * 新注册行为检测
 * @param {string} ip - 注册IP
 * @param {string} phone - 手机号
 * @returns {Promise<Object>} - { risk_score, blocked, reasons }
 */
async function checkRegistration(ip, phone) {
  const reasons = [];
  let riskScore = 0;

  // 1. 检查同IP注册频率
  const ipRegCount = await getCounter(`reg:ip:${ip}`, 3600);
  if (ipRegCount > 5) {
    riskScore += 30;
    reasons.push('同IP注册过于频繁');
  }

  // 2. 检查手机号段风险
  if (isRiskPhoneSegment(phone)) {
    riskScore += 10;
    reasons.push('高风险号段');
  }

  // 3. 检查同IP设备数量
  const ipDeviceCount = await getCounter(`device:ip:${ip}`, 86400);
  if (ipDeviceCount > 10) {
    riskScore += 20;
    reasons.push('同IP设备过多');
  }

  await incrementCounter(`reg:ip:${ip}`, 3600);

  return {
    risk_score: riskScore,
    blocked: riskScore >= 50,
    reasons
  };
}

/**
 * 消息行为检测
 * @param {number} userId - 用户ID
 * @param {string} content - 消息内容
 * @returns {Promise<Object>}
 */
async function checkMessageBehavior(userId, content) {
  let riskScore = 0;
  const reasons = [];

  // 1. 检查消息频率
  const msgCount = await getCounter(`msg:user:${userId}`, 60);
  if (msgCount > 20) {
    riskScore += 40;
    reasons.push('消息发送过于频繁');
  }

  // 2. 检测重复内容群发
  const contentHash = simpleHash(content);
  const duplicateCount = await getCounter(`msg:content:${contentHash}`, 300);
  if (duplicateCount > 3) {
    riskScore += 50;
    reasons.push('群发相同内容');
  }

  // 3. 检查是否新用户（注册<1天）
  try {
    if (isDbAvailable()) {
      const [rows] = await executeQuery(
        'SELECT created_at FROM users WHERE id = ?', [userId]
      );
      if (rows.length > 0) {
        const hoursSinceReg = (Date.now() - new Date(rows[0].created_at).getTime()) / 3600000;
        if (hoursSinceReg < 1 && msgCount > 5) {
          riskScore += 30;
          reasons.push('新用户高频发消息');
        }
      }
    }
  } catch (err) {
    // 忽略
  }

  await incrementCounter(`msg:user:${userId}`, 60);
  await incrementCounter(`msg:content:${contentHash}`, 300);

  return {
    risk_score: riskScore,
    blocked: riskScore >= 60,
    reasons
  };
}

/**
 * 喜欢行为检测
 * @param {number} userId - 用户ID
 * @returns {Promise<Object>}
 */
async function checkLikeBehavior(userId) {
  const likeCount = await getCounter(`like:user:${userId}`, 60);
  await incrementCounter(`like:user:${userId}`, 60);

  if (likeCount > 30) {
    return { risk_score: 60, blocked: true, reasons: ['短时间大量喜欢操作'] };
  }
  return { risk_score: likeCount * 2, blocked: false, reasons: [] };
}

// ==================== 辅助函数 ====================

async function getCounter(key, ttl) {
  try {
    const redisAvailable = await redis.ensureConnected();
    if (redisAvailable) {
      const client = redis.getClient();
      const val = await client.get(`antifraud:${key}`);
      return val ? parseInt(val) : 0;
    }
  } catch (err) {
    // fall through
  }
  const entry = memoryCounters.get(key);
  if (!entry) return 0;
  if (Date.now() > entry.expireAt) {
    memoryCounters.delete(key);
    return 0;
  }
  return entry.value;
}

async function incrementCounter(key, ttl) {
  try {
    const redisAvailable = await redis.ensureConnected();
    if (redisAvailable) {
      const client = redis.getClient();
      const exists = await client.exists(`antifraud:${key}`);
      if (exists) {
        await client.incr(`antifraud:${key}`);
      } else {
        await client.set(`antifraud:${key}`, 1, { EX: ttl });
      }
      return;
    }
  } catch (err) {
    // fall through
  }
  const entry = memoryCounters.get(key);
  if (entry && Date.now() < entry.expireAt) {
    entry.value++;
  } else {
    memoryCounters.set(key, { value: 1, expireAt: Date.now() + ttl * 1000 });
  }
}

function isRiskPhoneSegment(phone) {
  // 虚拟运营商号段
  const riskSegments = ['170', '171', '165', '167'];
  return riskSegments.some(s => phone.startsWith(s));
}

function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

module.exports = {
  checkRegistration,
  checkMessageBehavior,
  checkLikeBehavior
};
