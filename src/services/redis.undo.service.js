/**
 * Redis 滑动撤销服务
 * 使用 Redis 存储最近滑动动作，3秒TTL
 */
const redis = require('../config/redis');

/** 记录滑动 */
async function recordSwipe(userId, targetUserId, action) {
  try {
    if (!redis.isRedisAvailable()) return;
    const client = redis.getClient();
    const key = `swipe:undo:${userId}`;
    const value = JSON.stringify({ action, target_user_id: targetUserId, time: Date.now() });
    await client.setEx(key, 3, value); // 3秒TTL
  } catch (e) { /* 静默 */ }
}

/** 获取最后滑动（3秒内有效） */
async function getLastSwipe(userId) {
  try {
    if (!redis.isRedisAvailable()) return null;
    const client = redis.getClient();
    const key = `swipe:undo:${userId}`;
    const val = await client.get(key);
    if (!val) return null;
    return JSON.parse(val);
  } catch (e) { return null; }
}

/** 清除滑动记录 */
async function clearSwipe(userId) {
  try {
    if (!redis.isRedisAvailable()) return;
    const client = redis.getClient();
    await client.del(`swipe:undo:${userId}`);
  } catch (e) { /* 静默 */ }
}

module.exports = { recordSwipe, getLastSwipe, clearSwipe };
