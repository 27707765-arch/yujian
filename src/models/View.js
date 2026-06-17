const { executeQuery, isDbAvailable } = require('../utils/database');

const memoryStore = [];
let autoIncrementId = 1;

class View {
  static async create(user_id, target_user_id) {
    try {
      if (isDbAvailable()) {
        await executeQuery(
          'INSERT INTO user_views (user_id, target_user_id) VALUES (?, ?)',
          [user_id, target_user_id]
        );
      }
    } catch (error) {
      console.error('记录浏览失败:', error.message);
    }
    const record = { id: autoIncrementId++, user_id, target_user_id, created_at: new Date() };
    memoryStore.push(record);
  }

  static async getViewers(target_user_id, limit = 20, offset = 0) {
    try {
      if (isDbAvailable()) {
        const [rows] = await executeQuery(
          `SELECT v.*, u.nickname, u.avatar, u.gender, u.age, u.location
           FROM user_views v
           LEFT JOIN users u ON v.user_id = u.id
           WHERE v.target_user_id = ?
           ORDER BY v.created_at DESC
           LIMIT ? OFFSET ?`,
          [target_user_id, parseInt(limit), parseInt(offset)]
        );
        return rows;
      }
    } catch (error) {
      console.error('获取浏览者列表失败:', error.message);
    }
    return memoryStore
      .filter(v => v.target_user_id === target_user_id)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(offset, offset + limit);
  }
}

module.exports = View;
