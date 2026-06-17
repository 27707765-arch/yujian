/**
 * 用户拉黑模型
 * 用于处理用户拉黑/取消拉黑相关数据库操作
 */

const { executeQuery, isDbAvailable } = require('../utils/database');

// 内存存储（降级 fallback）
const memoryStore = new Map();
let autoIncrementId = 1;

class Block {
  /**
   * 拉黑用户
   * @param {number} userId - 拉黑者ID
   * @param {number} blockedUserId - 被拉黑者ID
   * @param {string} reason - 拉黑原因
   * @returns {Promise<Object>}
   */
  static async create(userId, blockedUserId, reason = null) {
    // 不能拉黑自己
    if (userId === blockedUserId) {
      throw new Error('不能拉黑自己');
    }

    try {
      if (isDbAvailable()) {
        // 先检查是否已拉黑
        const exists = await this.isBlocked(userId, blockedUserId);
        if (exists) {
          throw new Error('已经拉黑过该用户');
        }
        const [result] = await executeQuery(
          'INSERT INTO user_blocks (user_id, blocked_user_id, reason) VALUES (?, ?, ?)',
          [userId, blockedUserId, reason]
        );
        return this.findById(result.insertId);
      }
    } catch (err) {
      console.error('数据库操作失败，使用内存存储:', err.message);
      if (err.message.includes('已经拉黑')) throw err;
    }

    const id = autoIncrementId++;
    const block = { id, user_id: userId, blocked_user_id: blockedUserId, reason, created_at: new Date() };
    if (!memoryStore.has(userId)) memoryStore.set(userId, []);
    memoryStore.get(userId).push(block);
    return block;
  }

  /**
   * 根据ID查找拉黑记录
   * @param {number} id - 记录ID
   * @returns {Promise<Object|null>}
   */
  static async findById(id) {
    try {
      if (isDbAvailable()) {
        const [rows] = await executeQuery('SELECT * FROM user_blocks WHERE id = ?', [id]);
        return rows[0] || null;
      }
    } catch (err) {
      console.error('数据库查询失败:', err.message);
    }
    for (const [, blocks] of memoryStore) {
      const found = blocks.find(b => b.id === id);
      if (found) return found;
    }
    return null;
  }

  /**
   * 检查是否已拉黑
   * @param {number} userId - 拉黑者ID
   * @param {number} blockedUserId - 被拉黑者ID
   * @returns {Promise<boolean>}
   */
  static async isBlocked(userId, blockedUserId) {
    try {
      if (isDbAvailable()) {
        const [rows] = await executeQuery(
          'SELECT id FROM user_blocks WHERE user_id = ? AND blocked_user_id = ?',
          [userId, blockedUserId]
        );
        return rows.length > 0;
      }
    } catch (err) {
      console.error('数据库查询失败:', err.message);
    }
    const blocks = memoryStore.get(userId) || [];
    return blocks.some(b => b.blocked_user_id === blockedUserId);
  }

  /**
   * 检查两个用户之间是否存在拉黑关系（任意一方）
   * @param {number} user1Id - 用户1 ID
   * @param {number} user2Id - 用户2 ID
   * @returns {Promise<boolean>}
   */
  static async isMutualBlocked(user1Id, user2Id) {
    try {
      if (isDbAvailable()) {
        const [rows] = await executeQuery(
          'SELECT id FROM user_blocks WHERE (user_id = ? AND blocked_user_id = ?) OR (user_id = ? AND blocked_user_id = ?) LIMIT 1',
          [user1Id, user2Id, user2Id, user1Id]
        );
        return rows.length > 0;
      }
    } catch (err) {
      console.error('数据库查询失败:', err.message);
    }
    return await this.isBlocked(user1Id, user2Id) || await this.isBlocked(user2Id, user1Id);
  }

  /**
   * 取消拉黑
   * @param {number} userId - 拉黑者ID
   * @param {number} blockedUserId - 被拉黑者ID
   * @returns {Promise<boolean>}
   */
  static async delete(userId, blockedUserId) {
    try {
      if (isDbAvailable()) {
        const [result] = await executeQuery(
          'DELETE FROM user_blocks WHERE user_id = ? AND blocked_user_id = ?',
          [userId, blockedUserId]
        );
        return result.affectedRows > 0;
      }
    } catch (err) {
      console.error('数据库删除失败:', err.message);
    }
    const blocks = memoryStore.get(userId) || [];
    const idx = blocks.findIndex(b => b.blocked_user_id === blockedUserId);
    if (idx !== -1) {
      blocks.splice(idx, 1);
      return true;
    }
    return false;
  }

  /**
   * 获取用户的拉黑列表
   * @param {number} userId - 用户ID
   * @param {number} limit - 限制数量
   * @param {number} offset - 偏移量
   * @returns {Promise<Array>}
   */
  static async getBlockList(userId, limit = 20, offset = 0) {
    try {
      if (isDbAvailable()) {
        const [rows] = await executeQuery(
          `SELECT ub.*, u.nickname, u.avatar, u.gender, u.age
           FROM user_blocks ub
           LEFT JOIN users u ON ub.blocked_user_id = u.id
           WHERE ub.user_id = ?
           ORDER BY ub.created_at DESC
           LIMIT ? OFFSET ?`,
          [userId, limit, offset]
        );
        return rows;
      }
    } catch (err) {
      console.error('数据库查询失败:', err.message);
    }
    return (memoryStore.get(userId) || []).slice(offset, offset + limit);
  }

  /**
   * 获取被拉黑者ID列表（用于推荐过滤）
   * @param {number} userId - 用户ID
   * @returns {Promise<Array<number>>}
   */
  static async getBlockedUserIds(userId) {
    try {
      if (isDbAvailable()) {
        const [rows] = await executeQuery(
          'SELECT blocked_user_id FROM user_blocks WHERE user_id = ?',
          [userId]
        );
        return rows.map(r => r.blocked_user_id);
      }
    } catch (err) {
      console.error('数据库查询失败:', err.message);
    }
    return (memoryStore.get(userId) || []).map(b => b.blocked_user_id);
  }
}

module.exports = Block;
