/**
 * 用户隐私设置模型
 * 用于管理用户隐私偏好
 */

const { executeQuery, isDbAvailable } = require('../utils/database');

// 内存存储（降级 fallback）
const memoryStore = new Map();

// 默认设置
const DEFAULT_SETTINGS = {
  hide_distance: 0,
  hide_online_status: 0,
  hide_last_active: 0,
  allow_stranger_chat: 1,
  message_notify: 1,
  match_notify: 1,
  like_notify: 1,
  view_notify: 1
};

class UserSettings {
  /**
   * 批量获取多个用户的隐私设置
   * 用于推荐接口优化：一次查询替代 N 次 get() 调用
   * @param {number[]} userIds - 用户ID数组
   * @returns {Promise<Map<number, Object>>} - Map<userId, settings>
   *   settings 仅包含推荐所需的两个字段: hide_distance, hide_online_status
   */
  static async batchGet(userIds) {
    const result = new Map();
    if (!userIds || userIds.length === 0) {
      return result;
    }

    try {
      if (isDbAvailable()) {
        const placeholders = userIds.map(() => '?').join(', ');
        const sql = `SELECT user_id, hide_distance, hide_online_status FROM user_settings WHERE user_id IN (${placeholders})`;
        const [rows] = await executeQuery(sql, userIds);
        for (const row of rows) {
          result.set(row.user_id, row);
        }
        // 为没有设置记录的用户填充默认值
        for (const uid of userIds) {
          if (!result.has(uid)) {
            result.set(uid, { user_id: uid, hide_distance: 0, hide_online_status: 0 });
          }
        }
        return result;
      }
    } catch (err) {
      console.error('批量查询用户设置失败，使用内存存储:', err.message);
    }

    // 数据库不可用时使用内存存储降级
    for (const uid of userIds) {
      const entry = memoryStore.get(uid);
      if (entry) {
        result.set(uid, entry);
      } else {
        result.set(uid, { user_id: uid, ...DEFAULT_SETTINGS });
      }
    }
    return result;
  }

  /**
   * 获取用户设置（不存在则创建默认设置）
   * @param {number} userId - 用户ID
   * @returns {Promise<Object>}
   */
  static async get(userId) {
    try {
      if (isDbAvailable()) {
        const [rows] = await executeQuery('SELECT * FROM user_settings WHERE user_id = ?', [userId]);
        if (rows.length > 0) return rows[0];

        // 不存在则创建默认设置
        await executeQuery(
          `INSERT INTO user_settings (user_id) VALUES (?)`,
          [userId]
        );
        const [created] = await executeQuery('SELECT * FROM user_settings WHERE user_id = ?', [userId]);
        return created[0];
      }
    } catch (err) {
      console.error('数据库查询失败，使用内存存储:', err.message);
    }

    if (!memoryStore.has(userId)) {
      memoryStore.set(userId, { user_id: userId, ...DEFAULT_SETTINGS, created_at: new Date(), updated_at: new Date() });
    }
    return memoryStore.get(userId);
  }

  /**
   * 更新用户设置
   * @param {number} userId - 用户ID
   * @param {Object} settings - 设置对象
   * @returns {Promise<Object>}
   */
  static async update(userId, settings) {
    // 只允许更新合法字段
    const allowedFields = Object.keys(DEFAULT_SETTINGS);
    const filtered = {};
    for (const key of allowedFields) {
      if (settings[key] !== undefined) {
        filtered[key] = settings[key] ? 1 : 0;
      }
    }

    if (Object.keys(filtered).length === 0) {
      return this.get(userId);
    }

    try {
      if (isDbAvailable()) {
        // 确保设置行存在
        await this.get(userId);

        const fields = [];
        const values = [];
        for (const [key, value] of Object.entries(filtered)) {
          fields.push(`${key} = ?`);
          values.push(value);
        }
        values.push(userId);

        await executeQuery(
          `UPDATE user_settings SET ${fields.join(', ')} WHERE user_id = ?`,
          values
        );
        return this.get(userId);
      }
    } catch (err) {
      console.error('数据库更新失败:', err.message);
    }

    const current = memoryStore.get(userId) || { user_id: userId, ...DEFAULT_SETTINGS };
    Object.assign(current, filtered, { updated_at: new Date() });
    memoryStore.set(userId, current);
    return current;
  }
}

module.exports = UserSettings;
