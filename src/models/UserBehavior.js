/**
 * 用户行为记录模型
 * 记录用户的浏览、喜欢、跳过、消息、匹配等行为
 * 遵循"DB优先 + 内存降级"模式
 */

const { executeQuery, isDbAvailable } = require('../utils/database');

// 内存存储
const memoryStore = [];
let autoIncrementId = 1;

class UserBehavior {
  /**
   * 创建行为记录
   * @param {number} userId - 用户ID
   * @param {number} targetUserId - 目标用户ID
   * @param {string} action - 行为类型：view/like/skip/message/match/unmatch
   * @param {number} duration - 停留时长（秒），可选
   * @param {string} source - 来源页面，可选
   * @returns {Promise<Object>}
   */
  static async create(userId, targetUserId, action, duration = null, source = null) {
    try {
      if (isDbAvailable()) {
        const [result] = await executeQuery(
          'INSERT INTO user_behaviors (user_id, target_user_id, action, duration, source) VALUES (?, ?, ?, ?, ?)',
          [userId, targetUserId, action, duration, source]
        );
        return { id: result.insertId, user_id: userId, target_user_id: targetUserId, action, duration, source };
      }
    } catch (err) {
      console.error('数据库插入行为记录失败，使用内存存储:', err.message);
    }

    // 内存降级
    const id = autoIncrementId++;
    const record = {
      id, user_id: userId, target_user_id: targetUserId,
      action, duration, source,
      created_at: new Date()
    };
    memoryStore.push(record);
    return record;
  }

  /**
   * 获取用户最近的行为记录
   * @param {number} userId - 用户ID
   * @param {number} days - 最近N天，默认30天
   * @param {number} limit - 限制数量
   * @returns {Promise<Array>}
   */
  static async getRecentBehaviors(userId, days = 30, limit = 100) {
    try {
      if (isDbAvailable()) {
        const [rows] = await executeQuery(
          `SELECT * FROM user_behaviors
           WHERE user_id = ? AND created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
           ORDER BY created_at DESC LIMIT ?`,
          [userId, days, limit]
        );
        return rows;
      }
    } catch (err) {
      console.error('数据库查询行为记录失败，使用内存存储:', err.message);
    }

    // 内存降级
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    return memoryStore
      .filter(r => r.user_id === userId && new Date(r.created_at).getTime() >= cutoff)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, limit);
  }

  /**
   * 统计用户某类行为次数
   * @param {number} userId - 用户ID
   * @param {string} action - 行为类型
   * @param {number} days - 最近N天
   * @returns {Promise<number>}
   */
  static async countByAction(userId, action, days = 30) {
    try {
      if (isDbAvailable()) {
        const [rows] = await executeQuery(
          `SELECT COUNT(*) as cnt FROM user_behaviors
           WHERE user_id = ? AND action = ? AND created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)`,
          [userId, action, days]
        );
        return rows[0]?.cnt || 0;
      }
    } catch (err) {
      console.error('数据库统计行为失败，使用内存存储:', err.message);
    }

    // 内存降级
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    return memoryStore.filter(
      r => r.user_id === userId && r.action === action && new Date(r.created_at).getTime() >= cutoff
    ).length;
  }

  /**
   * 获取用户最近互动过的目标用户ID集合
   * @param {number} userId - 用户ID
   * @param {number} days - 最近N天
   * @returns {Promise<Set<number>>}
   */
  static async getRecentTargetIds(userId, days = 7) {
    const behaviors = await this.getRecentBehaviors(userId, days, 200);
    return new Set(behaviors.map(b => b.target_user_id));
  }
}

module.exports = UserBehavior;
