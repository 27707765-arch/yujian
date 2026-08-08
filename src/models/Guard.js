/**
 * 守护模型
 * 管理「守护」关系：用户可守护他人（一对多，重复守护幂等）。
 * 数据源：user_guards 表（DB 优先 → 内存降级）。
 */

const db = require('../utils/database');
const { executeQuery, isDbAvailable } = db;

// 内存存储（当数据库不可用时使用）
const memoryStore = [];
let autoIncrementId = 1;

class Guard {
  /**
   * 守护一个用户（重复守护幂等，不报错）
   * @param {number} guardUserId - 守护者ID
   * @param {number} guardedUserId - 被守护者ID
   * @returns {Promise<Object|null>} - 守护记录；已是守护关系时返回 null
   */
  static async create(guardUserId, guardedUserId) {
    if (guardUserId === guardedUserId) {
      throw new Error('不能守护自己');
    }
    try {
      if (db.isDbAvailable()) {
        const [result] = await executeQuery(
          'INSERT IGNORE INTO user_guards (guard_user_id, guarded_user_id) VALUES (?, ?)',
          [guardUserId, guardedUserId]
        );
        if (!result || result.affectedRows === 0) {
          return null; // 已存在守护关系
        }
        const [rows] = await executeQuery(
          'SELECT * FROM user_guards WHERE guard_user_id = ? AND guarded_user_id = ?',
          [guardUserId, guardedUserId]
        );
        return rows[0] || null;
      }
    } catch (err) {
      console.error('守护操作失败，使用内存存储:', err.message);
    }
    // 内存降级：幂等
    const exists = memoryStore.some(g => g.guard_user_id === guardUserId && g.guarded_user_id === guardedUserId);
    if (exists) return null;
    const record = { id: autoIncrementId++, guard_user_id: guardUserId, guarded_user_id: guardedUserId, created_at: new Date() };
    memoryStore.push(record);
    return record;
  }

  /**
   * 取消守护
   * @param {number} guardUserId - 守护者ID
   * @param {number} guardedUserId - 被守护者ID
   * @returns {Promise<boolean>}
   */
  static async remove(guardUserId, guardedUserId) {
    try {
      if (db.isDbAvailable()) {
        const [result] = await executeQuery(
          'DELETE FROM user_guards WHERE guard_user_id = ? AND guarded_user_id = ?',
          [guardUserId, guardedUserId]
        );
        return result.affectedRows > 0;
      }
    } catch (err) {
      console.error('取消守护失败，使用内存存储:', err.message);
    }
    const idx = memoryStore.findIndex(g => g.guard_user_id === guardUserId && g.guarded_user_id === guardedUserId);
    if (idx > -1) {
      memoryStore.splice(idx, 1);
      return true;
    }
    return false;
  }

  /**
   * 检查是否已守护
   * @param {number} guardUserId - 守护者ID
   * @param {number} guardedUserId - 被守护者ID
   * @returns {Promise<boolean>}
   */
  static async exists(guardUserId, guardedUserId) {
    try {
      if (db.isDbAvailable()) {
        const [rows] = await executeQuery(
          'SELECT id FROM user_guards WHERE guard_user_id = ? AND guarded_user_id = ?',
          [guardUserId, guardedUserId]
        );
        return rows.length > 0;
      }
    } catch (err) {
      console.error('查询守护关系失败，使用内存存储:', err.message);
    }
    return memoryStore.some(g => g.guard_user_id === guardUserId && g.guarded_user_id === guardedUserId);
  }

  /**
   * 我守护的列表
   * @param {number} guardUserId - 守护者ID
   * @param {number} limit - 限制数量
   * @param {number} offset - 偏移量
   * @returns {Promise<Array>} 含被守护者用户信息
   */
  static async getGuarding(guardUserId, limit = 20, offset = 0) {
    try {
      if (db.isDbAvailable()) {
        const [rows] = await executeQuery(
          `SELECT ug.id, ug.guarded_user_id as target_user_id, ug.created_at,
                  u.nickname, u.avatar, u.gender, u.age, u.location
           FROM user_guards ug
           LEFT JOIN users u ON ug.guarded_user_id = u.id
           WHERE ug.guard_user_id = ?
           ORDER BY ug.created_at DESC
           LIMIT ? OFFSET ?`,
          [guardUserId, parseInt(limit), parseInt(offset)]
        );
        return rows;
      }
    } catch (err) {
      console.error('查询守护列表失败，使用内存存储:', err.message);
    }
    return memoryStore
      .filter(g => g.guard_user_id === guardUserId)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(offset, offset + limit);
  }

  /**
   * 守护我的列表
   * @param {number} guardedUserId - 被守护者ID
   * @param {number} limit - 限制数量
   * @param {number} offset - 偏移量
   * @returns {Promise<Array>} 含守护者用户信息
   */
  static async getGuarders(guardedUserId, limit = 20, offset = 0) {
    try {
      if (db.isDbAvailable()) {
        const [rows] = await executeQuery(
          `SELECT ug.id, ug.guard_user_id as target_user_id, ug.created_at,
                  u.nickname, u.avatar, u.gender, u.age, u.location
           FROM user_guards ug
           LEFT JOIN users u ON ug.guard_user_id = u.id
           WHERE ug.guarded_user_id = ?
           ORDER BY ug.created_at DESC
           LIMIT ? OFFSET ?`,
          [guardedUserId, parseInt(limit), parseInt(offset)]
        );
        return rows;
      }
    } catch (err) {
      console.error('查询守护者列表失败，使用内存存储:', err.message);
    }
    return memoryStore
      .filter(g => g.guarded_user_id === guardedUserId)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(offset, offset + limit);
  }

  /**
   * 我守护的人数
   * @param {number} guardUserId - 守护者ID
   * @returns {Promise<number>}
   */
  static async countGuarding(guardUserId) {
    try {
      if (db.isDbAvailable()) {
        const [rows] = await executeQuery(
          'SELECT COUNT(*) as cnt FROM user_guards WHERE guard_user_id = ?',
          [guardUserId]
        );
        return rows[0]?.cnt || 0;
      }
    } catch (err) {
      console.error('查询守护计数失败，使用内存存储:', err.message);
    }
    return memoryStore.filter(g => g.guard_user_id === guardUserId).length;
  }

  /**
   * 守护我的人数
   * @param {number} guardedUserId - 被守护者ID
   * @returns {Promise<number>}
   */
  static async countGuarders(guardedUserId) {
    try {
      if (db.isDbAvailable()) {
        const [rows] = await executeQuery(
          'SELECT COUNT(*) as cnt FROM user_guards WHERE guarded_user_id = ?',
          [guardedUserId]
        );
        return rows[0]?.cnt || 0;
      }
    } catch (err) {
      console.error('查询守护者计数失败，使用内存存储:', err.message);
    }
    return memoryStore.filter(g => g.guarded_user_id === guardedUserId).length;
  }
}

module.exports = Guard;
