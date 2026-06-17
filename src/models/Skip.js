const { executeQuery, isDbAvailable } = require('../utils/database');

const memoryStore = new Map();
let autoIncrementId = 1;

class Skip {
  static async create(user_id, target_user_id) {
    try {
      if (isDbAvailable()) {
        const [result] = await executeQuery(
          'INSERT INTO skips (user_id, target_user_id) VALUES (?, ?)',
          [user_id, target_user_id]
        );
        return this.findById(result.insertId);
      }
    } catch (error) {
      console.error('数据库操作失败，使用内存存储:', error.message);
    }

    const id = autoIncrementId++;
    const skip = { id, user_id, target_user_id, created_at: new Date() };
    memoryStore.set(id, skip);
    return skip;
  }

  static async findById(id) {
    try {
      if (isDbAvailable()) {
        const [rows] = await executeQuery('SELECT * FROM skips WHERE id = ?', [id]);
        return rows[0] || null;
      }
    } catch (error) {
      console.error('数据库查询失败:', error.message);
    }
    return memoryStore.get(id) || null;
  }

  static async exists(user_id, target_user_id) {
    try {
      if (isDbAvailable()) {
        const [rows] = await executeQuery(
          'SELECT * FROM skips WHERE user_id = ? AND target_user_id = ?',
          [user_id, target_user_id]
        );
        return rows.length > 0;
      }
    } catch (error) {
      console.error('数据库查询失败:', error.message);
    }
    return Array.from(memoryStore.values()).some(
      s => s.user_id === user_id && s.target_user_id === target_user_id
    );
  }

  static async getSkippedUserIds(user_id, days = 30) {
    const since = new Date(Date.now() - days * 86400000);
    try {
      if (isDbAvailable()) {
        const [rows] = await executeQuery(
          'SELECT target_user_id FROM skips WHERE user_id = ? AND created_at >= ?',
          [user_id, since]
        );
        return rows.map(r => r.target_user_id);
      }
    } catch (error) {
      console.error('数据库查询失败:', error.message);
    }
    return Array.from(memoryStore.values())
      .filter(s => s.user_id === user_id && new Date(s.created_at) >= since)
      .map(s => s.target_user_id);
  }
}

module.exports = Skip;
