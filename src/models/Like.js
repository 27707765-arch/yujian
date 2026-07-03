// 文件名：src/models/Like.js
// 用途：喜欢模型

const { executeQuery, isDbAvailable } = require('../utils/database');

// 内存存储（当数据库不可用时使用）
const memoryStore = new Map();
let autoIncrementId = 1;

class Like {
  /**
   * 创建喜欢记录
   * @param {number} user_id - 用户ID
   * @param {number} target_user_id - 目标用户ID
   * @returns {Promise<Object>}
   */
  static async create(user_id, target_user_id) {
    try {
      if (isDbAvailable()) {
        const [result] = await executeQuery(
          'INSERT INTO likes (user_id, target_user_id) VALUES (?, ?)',
          [user_id, target_user_id]
        );
        return this.findById(result.insertId);
      }
    } catch (error) {
      console.error('数据库操作失败，使用内存存储:', error.message);
    }
    
    // 数据库不可用时使用内存存储
    const id = autoIncrementId++;
    const like = {
      id,
      user_id,
      target_user_id,
      created_at: new Date()
    };
    memoryStore.set(id, like);
    return like;
  }

  /**
   * 根据ID查找喜欢记录
   * @param {number} id - 记录ID
   * @returns {Promise<Object|null>}
   */
  static async findById(id) {
    try {
      if (isDbAvailable()) {
        const [rows] = await executeQuery('SELECT * FROM likes WHERE id = ?', [id]);
        return rows[0] || null;
      }
    } catch (error) {
      console.error('数据库查询失败，使用内存存储:', error.message);
    }
    
    // 数据库不可用时使用内存存储
    return memoryStore.get(id) || null;
  }

  /**
   * 检查用户是否已喜欢目标用户
   * @param {number} user_id - 用户ID
   * @param {number} target_user_id - 目标用户ID
   * @returns {Promise<boolean>}
   */
  static async exists(user_id, target_user_id) {
    try {
      if (isDbAvailable()) {
        const [rows] = await executeQuery(
          'SELECT * FROM likes WHERE user_id = ? AND target_user_id = ?',
          [user_id, target_user_id]
        );
        return rows.length > 0;
      }
    } catch (error) {
      console.error('数据库查询失败，使用内存存储:', error.message);
    }
    
    // 数据库不可用时使用内存存储
    return Array.from(memoryStore.values()).some(
      like => like.user_id === user_id && like.target_user_id === target_user_id
    );
  }

  /**
   * 获取用户的喜欢列表
   * @param {number} user_id - 用户ID
   * @param {number} limit - 限制数量
   * @param {number} offset - 偏移量
   * @returns {Promise<Array>}
   */
  static async getUserLikes(user_id, limit = 20, offset = 0) {
    try {
      if (isDbAvailable()) {
        const [rows] = await executeQuery(
          `SELECT l.*, u.id as target_user_id, u.nickname, u.avatar, u.gender, u.age, u.height, u.occupation, u.location 
           FROM likes l
           LEFT JOIN users u ON l.target_user_id = u.id
           WHERE l.user_id = ?
           ORDER BY l.created_at DESC
           LIMIT ? OFFSET ?`,
          [user_id, limit, offset]
        );
        return rows;
      }
    } catch (error) {
      console.error('数据库查询失败，使用内存存储:', error.message);
    }
    
    // 数据库不可用时使用内存存储
    // 这里简化处理，实际应用中可能需要更复杂的逻辑
    return Array.from(memoryStore.values())
      .filter(like => like.user_id === user_id)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(offset, offset + limit);
  }

  /**
   * 获取喜欢用户的列表
   * @param {number} user_id - 用户ID
   * @param {number} limit - 限制数量
   * @param {number} offset - 偏移量
   * @returns {Promise<Array>}
   */
  static async getLikedByUsers(user_id, limit = 20, offset = 0) {
    try {
      if (isDbAvailable()) {
        const [rows] = await executeQuery(
          `SELECT l.*, u.id as liker_id, u.nickname, u.avatar, u.gender, u.age, u.height, u.occupation, u.location 
           FROM likes l
           LEFT JOIN users u ON l.user_id = u.id
           WHERE l.target_user_id = ?
           ORDER BY l.created_at DESC
           LIMIT ? OFFSET ?`,
          [user_id, limit, offset]
        );
        return rows;
      }
    } catch (error) {
      console.error('数据库查询失败，使用内存存储:', error.message);
    }
    
    // 数据库不可用时使用内存存储
    // 这里简化处理，实际应用中可能需要更复杂的逻辑
    return Array.from(memoryStore.values())
      .filter(like => like.target_user_id === user_id)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(offset, offset + limit);
  }

  /**
   * 批量检查用户是否已喜欢多个目标用户
   * 用于推荐接口优化：一次查询替代 N 次 exists() 调用
   * @param {number} userId - 用户ID
   * @param {number[]} targetIds - 目标用户ID数组
   * @returns {Promise<Set<number>>} - 已喜欢的 target_user_id 集合
   */
  static async batchExists(userId, targetIds) {
    if (!targetIds || targetIds.length === 0) {
      return new Set();
    }

    try {
      if (isDbAvailable()) {
        // 动态生成占位符: (?, ?, ?, ...)
        const placeholders = targetIds.map(() => '?').join(', ');
        const sql = `SELECT target_user_id FROM likes WHERE user_id = ? AND target_user_id IN (${placeholders})`;
        const [rows] = await executeQuery(sql, [userId, ...targetIds]);
        return new Set(rows.map(r => r.target_user_id));
      }
    } catch (error) {
      console.error('批量查询喜欢记录失败，使用内存存储:', error.message);
    }

    // 数据库不可用时使用内存存储降级
    const result = new Set();
    for (const like of memoryStore.values()) {
      if (like.user_id === userId && targetIds.includes(like.target_user_id)) {
        result.add(like.target_user_id);
      }
    }
    return result;
  }

  /**
   * 删除喜欢记录
   * @param {number} user_id - 用户ID
   * @param {number} target_user_id - 目标用户ID
   * @returns {Promise<boolean>}
   */
  static async delete(user_id, target_user_id) {
    try {
      if (isDbAvailable()) {
        const [result] = await executeQuery(
          'DELETE FROM likes WHERE user_id = ? AND target_user_id = ?',
          [user_id, target_user_id]
        );
        return result.affectedRows > 0;
      }
    } catch (error) {
      console.error('数据库删除失败，使用内存存储:', error.message);
    }
    
    // 数据库不可用时使用内存存储
    let deleted = false;
    for (const [id, like] of memoryStore.entries()) {
      if (like.user_id === user_id && like.target_user_id === target_user_id) {
        memoryStore.delete(id);
        deleted = true;
        break;
      }
    }
    return deleted;
  }
}

module.exports = Like;