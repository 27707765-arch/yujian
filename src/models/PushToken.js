/**
 * 推送设备Token模型
 * 用于管理用户设备推送Token
 */

const { executeQuery, isDbAvailable } = require('../utils/database');

// 内存存储（降级 fallback）
const memoryStore = new Map();

class PushToken {
  /**
   * 注册或更新设备Token
   * @param {number} userId - 用户ID
   * @param {string} platform - 平台：ios/android/web
   * @param {string} deviceToken - 设备Token
   * @returns {Promise<Object>}
   */
  static async register(userId, platform, deviceToken) {
    try {
      if (isDbAvailable()) {
        // 检查是否已存在
        const [existing] = await executeQuery(
          'SELECT id FROM push_tokens WHERE user_id = ? AND device_token = ?',
          [userId, deviceToken]
        );
        if (existing.length > 0) {
          // 更新为有效
          await executeQuery(
            'UPDATE push_tokens SET is_active = 1, platform = ?, updated_at = NOW() WHERE id = ?',
            [platform, existing[0].id]
          );
          return { id: existing[0].id, user_id: userId, platform, device_token: deviceToken, is_active: 1 };
        }
        // 新增
        const [result] = await executeQuery(
          'INSERT INTO push_tokens (user_id, platform, device_token) VALUES (?, ?, ?)',
          [userId, platform, deviceToken]
        );
        return { id: result.insertId, user_id: userId, platform, device_token: deviceToken, is_active: 1 };
      }
    } catch (err) {
      console.error('数据库操作失败，使用内存存储:', err.message);
    }

    const key = `${userId}:${platform}`;
    memoryStore.set(key, { user_id: userId, platform, device_token: deviceToken, is_active: 1 });
    return { user_id: userId, platform, device_token: deviceToken };
  }

  /**
   * 注销设备Token
   * @param {number} userId - 用户ID
   * @param {string} deviceToken - 设备Token
   * @returns {Promise<boolean>}
   */
  static async unregister(userId, deviceToken) {
    try {
      if (isDbAvailable()) {
        await executeQuery(
          'UPDATE push_tokens SET is_active = 0 WHERE user_id = ? AND device_token = ?',
          [userId, deviceToken]
        );
        return true;
      }
    } catch (err) {
      console.error('数据库操作失败:', err.message);
    }
    const key = `${userId}:*`;
    for (const [k] of memoryStore) {
      if (k.startsWith(key)) memoryStore.delete(k);
    }
    return true;
  }

  /**
   * 获取用户所有活跃设备的Token
   * @param {number} userId - 用户ID
   * @returns {Promise<Array>}
   */
  static async getByUserId(userId) {
    try {
      if (isDbAvailable()) {
        const [rows] = await executeQuery(
          'SELECT * FROM push_tokens WHERE user_id = ? AND is_active = 1',
          [userId]
        );
        return rows;
      }
    } catch (err) {
      console.error('数据库查询失败:', err.message);
    }
    const result = [];
    for (const [key, token] of memoryStore) {
      if (key.startsWith(`${userId}:`) && token.is_active) {
        result.push(token);
      }
    }
    return result;
  }

  /**
   * 获取所有用户的所有活跃Token（用于全局推送）
   * @returns {Promise<Array>}
   */
  static async getAllActive() {
    try {
      if (isDbAvailable()) {
        const [rows] = await executeQuery('SELECT * FROM push_tokens WHERE is_active = 1');
        return rows;
      }
    } catch (err) {
      console.error('数据库查询失败:', err.message);
    }
    return Array.from(memoryStore.values()).filter(t => t.is_active);
  }
}

module.exports = PushToken;
