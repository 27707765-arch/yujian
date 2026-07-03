// 文件名：src/models/Match.js
// 用途：匹配模型

const { executeQuery, isDbAvailable } = require('../utils/database');

// 内存存储（当数据库不可用时使用）
const memoryStore = new Map();
let autoIncrementId = 1;

class Match {
  /**
   * 创建匹配记录
   * @param {number} user1_id - 用户1 ID
   * @param {number} user2_id - 用户2 ID
   * @returns {Promise<Object>}
   */
  static async create(user1_id, user2_id) {
    // 确保user1_id < user2_id，保证唯一性
    if (user1_id > user2_id) {
      [user1_id, user2_id] = [user2_id, user1_id];
    }
    
    try {
      if (isDbAvailable()) {
        const [result] = await executeQuery(
          'INSERT INTO matches (user1_id, user2_id) VALUES (?, ?)',
          [user1_id, user2_id]
        );
        return this.findById(result.insertId);
      }
    } catch (error) {
      console.error('数据库操作失败，使用内存存储:', error.message);
    }
    
    // 数据库不可用时使用内存存储
    const id = autoIncrementId++;
    const match = {
      id,
      user1_id,
      user2_id,
      status: 1,
      created_at: new Date(),
      updated_at: new Date()
    };
    memoryStore.set(id, match);
    return match;
  }

  /**
   * 根据ID查找匹配记录
   * @param {number} id - 记录ID
   * @returns {Promise<Object|null>}
   */
  static async findById(id) {
    try {
      if (isDbAvailable()) {
        const [rows] = await executeQuery('SELECT * FROM matches WHERE id = ?', [id]);
        return rows[0] || null;
      }
    } catch (error) {
      console.error('数据库查询失败，使用内存存储:', error.message);
    }
    
    // 数据库不可用时使用内存存储
    return memoryStore.get(id) || null;
  }

  /**
   * 检查两个用户是否已匹配
   * @param {number} user1_id - 用户1 ID
   * @param {number} user2_id - 用户2 ID
   * @returns {Promise<Object|null>}
   */
  static async exists(user1_id, user2_id) {
    // 确保user1_id < user2_id
    if (user1_id > user2_id) {
      [user1_id, user2_id] = [user2_id, user1_id];
    }
    
    try {
      if (isDbAvailable()) {
        const [rows] = await executeQuery(
          'SELECT * FROM matches WHERE user1_id = ? AND user2_id = ? AND status = 1',
          [user1_id, user2_id]
        );
        return rows[0] || null;
      }
    } catch (error) {
      console.error('数据库查询失败，使用内存存储:', error.message);
    }
    
    // 数据库不可用时使用内存存储
    for (const match of memoryStore.values()) {
      if (
        match.status === 1 &&
        ((match.user1_id === user1_id && match.user2_id === user2_id) ||
         (match.user1_id === user2_id && match.user2_id === user1_id))
      ) {
        return match;
      }
    }
    return null;
  }

  /**
   * 获取用户的匹配列表
   * @param {number} user_id - 用户ID
   * @param {number} limit - 限制数量
   * @param {number} offset - 偏移量
   * @returns {Promise<Array>}
   */
  static async getUserMatches(user_id, limit = 20, offset = 0) {
    try {
      if (isDbAvailable()) {
        const [rows] = await executeQuery(
          `SELECT m.*, 
           CASE 
             WHEN m.user1_id = ? THEN u2.id ELSE u1.id END as match_user_id,
           CASE 
             WHEN m.user1_id = ? THEN u2.nickname ELSE u1.nickname END as match_user_nickname,
           CASE 
             WHEN m.user1_id = ? THEN u2.avatar ELSE u1.avatar END as match_user_avatar,
           CASE 
             WHEN m.user1_id = ? THEN u2.gender ELSE u1.gender END as match_user_gender,
           CASE 
             WHEN m.user1_id = ? THEN u2.age ELSE u1.age END as match_user_age,
           CASE 
             WHEN m.user1_id = ? THEN u2.location ELSE u1.location END as match_user_location
           FROM matches m
           LEFT JOIN users u1 ON m.user1_id = u1.id
           LEFT JOIN users u2 ON m.user2_id = u2.id
           WHERE (m.user1_id = ? OR m.user2_id = ?) AND m.status = 1
           ORDER BY m.created_at DESC
           LIMIT ? OFFSET ?`,
          [user_id, user_id, user_id, user_id, user_id, user_id, user_id, user_id, limit, offset]
        );
        return rows;
      }
    } catch (error) {
      console.error('数据库查询失败，使用内存存储:', error.message);
    }
    
    // 数据库不可用时使用内存存储
    // 这里简化处理，实际应用中可能需要更复杂的逻辑
    return Array.from(memoryStore.values())
      .filter(match => 
        match.status === 1 && (match.user1_id === user_id || match.user2_id === user_id)
      )
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(offset, offset + limit);
  }

  /**
   * 批量检查用户与多个目标用户是否已匹配
   * 用于推荐接口优化：一次查询替代 N 次 exists() 调用
   * UNION 同时查询 user1→user2 和 user2→user1 两个方向
   * @param {number} userId - 用户ID
   * @param {number[]} targetIds - 目标用户ID数组
   * @returns {Promise<Set<number>>} - 已匹配的对方用户ID集合
   */
  static async batchExists(userId, targetIds) {
    if (!targetIds || targetIds.length === 0) {
      return new Set();
    }

    try {
      if (isDbAvailable()) {
        const placeholders = targetIds.map(() => '?').join(', ');
        // 双向查询：user1_id=userId AND user2_id IN targetIds  或  user2_id=userId AND user1_id IN targetIds
        const sql = `SELECT user2_id AS matched_id FROM matches WHERE user1_id = ? AND user2_id IN (${placeholders}) AND status = 1
                     UNION
                     SELECT user1_id AS matched_id FROM matches WHERE user2_id = ? AND user1_id IN (${placeholders}) AND status = 1`;
        const [rows] = await executeQuery(sql, [userId, ...targetIds, userId, ...targetIds]);
        return new Set(rows.map(r => r.matched_id));
      }
    } catch (error) {
      console.error('批量查询匹配记录失败，使用内存存储:', error.message);
    }

    // 数据库不可用时使用内存存储降级
    const result = new Set();
    for (const match of memoryStore.values()) {
      if (match.status !== 1) continue;
      if (match.user1_id === userId && targetIds.includes(match.user2_id)) {
        result.add(match.user2_id);
      } else if (match.user2_id === userId && targetIds.includes(match.user1_id)) {
        result.add(match.user1_id);
      }
    }
    return result;
  }

  /**
   * 解除匹配
   * @param {number} user1_id - 用户1 ID
   * @param {number} user2_id - 用户2 ID
   * @returns {Promise<boolean>}
   */
  static async unmatch(user1_id, user2_id) {
    // 确保user1_id < user2_id
    if (user1_id > user2_id) {
      [user1_id, user2_id] = [user2_id, user1_id];
    }
    
    try {
      if (isDbAvailable()) {
        const [result] = await executeQuery(
          'UPDATE matches SET status = 0 WHERE user1_id = ? AND user2_id = ? AND status = 1',
          [user1_id, user2_id]
        );
        return result.affectedRows > 0;
      }
    } catch (error) {
      console.error('数据库更新失败，使用内存存储:', error.message);
    }
    
    // 数据库不可用时使用内存存储
    let updated = false;
    for (const [id, match] of memoryStore.entries()) {
      if (
        match.status === 1 &&
        match.user1_id === user1_id &&
        match.user2_id === user2_id
      ) {
        match.status = 0;
        match.updated_at = new Date();
        memoryStore.set(id, match);
        updated = true;
        break;
      }
    }
    return updated;
  }
}

module.exports = Match;