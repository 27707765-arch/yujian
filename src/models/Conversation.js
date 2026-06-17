// 文件名：src/models/Conversation.js
// 用途：会话模型

const { executeQuery, isDbAvailable } = require('../utils/database');

// 内存存储（当数据库不可用时使用）
const memoryStore = new Map();
let autoIncrementId = 1;

class Conversation {
  /**
   * 创建或获取会话
   * @param {number} user1_id - 用户1 ID
   * @param {number} user2_id - 用户2 ID
   * @returns {Promise<Object>}
   */
  static async createOrGet(user1_id, user2_id) {
    // 确保user1_id < user2_id，保证唯一性
    if (user1_id > user2_id) {
      [user1_id, user2_id] = [user2_id, user1_id];
    }
    
    try {
      if (isDbAvailable()) {
        // 查找现有会话
        const [existing] = await executeQuery(
          'SELECT * FROM conversations WHERE user1_id = ? AND user2_id = ?',
          [user1_id, user2_id]
        );
        
        if (existing[0]) {
          return existing[0];
        }
        
        // 创建新会话
        const [result] = await executeQuery(
          'INSERT INTO conversations (user1_id, user2_id) VALUES (?, ?)',
          [user1_id, user2_id]
        );
        
        return this.findById(result.insertId);
      }
    } catch (error) {
      console.error('数据库操作失败，使用内存存储:', error.message);
    }
    
    // 数据库不可用时使用内存存储
    // 查找现有会话
    for (const conversation of memoryStore.values()) {
      if (
        (conversation.user1_id === user1_id && conversation.user2_id === user2_id) ||
        (conversation.user1_id === user2_id && conversation.user2_id === user1_id)
      ) {
        return conversation;
      }
    }
    
    // 创建新会话
    const id = autoIncrementId++;
    const conversation = {
      id,
      user1_id,
      user2_id,
      unread_count: 0,
      last_message: null,
      last_message_time: null,
      created_at: new Date(),
      updated_at: new Date()
    };
    memoryStore.set(id, conversation);
    return conversation;
  }

  /**
   * 根据ID查找会话
   * @param {number} id - 会话ID
   * @returns {Promise<Object|null>}
   */
  static async findById(id) {
    try {
      if (isDbAvailable()) {
        const [rows] = await executeQuery('SELECT * FROM conversations WHERE id = ?', [id]);
        return rows[0] || null;
      }
    } catch (error) {
      console.error('数据库查询失败，使用内存存储:', error.message);
    }
    
    // 数据库不可用时使用内存存储
    return memoryStore.get(id) || null;
  }

  /**
   * 根据两个用户ID查找会话
   * @param {number} user1_id - 用户1 ID
   * @param {number} user2_id - 用户2 ID
   * @returns {Promise<Object|null>}
   */
  static async findByUsers(user1_id, user2_id) {
    // 确保user1_id < user2_id
    if (user1_id > user2_id) {
      [user1_id, user2_id] = [user2_id, user1_id];
    }
    
    try {
      if (isDbAvailable()) {
        const [rows] = await executeQuery(
          'SELECT * FROM conversations WHERE user1_id = ? AND user2_id = ?',
          [user1_id, user2_id]
        );
        return rows[0] || null;
      }
    } catch (error) {
      console.error('数据库查询失败，使用内存存储:', error.message);
    }
    
    // 数据库不可用时使用内存存储
    for (const conversation of memoryStore.values()) {
      if (
        (conversation.user1_id === user1_id && conversation.user2_id === user2_id) ||
        (conversation.user1_id === user2_id && conversation.user2_id === user1_id)
      ) {
        return conversation;
      }
    }
    return null;
  }

  /**
   * 获取用户的会话列表
   * @param {number} user_id - 用户ID
   * @returns {Promise<Array>}
   */
  static async getUserConversations(user_id) {
    try {
      if (isDbAvailable()) {
        const [rows] = await executeQuery(
          `SELECT c.*, 
           CASE 
             WHEN c.user1_id = ? THEN u2.id ELSE u1.id END as other_user_id,
           CASE 
             WHEN c.user1_id = ? THEN u2.nickname ELSE u1.nickname END as other_user_nickname,
           CASE 
             WHEN c.user1_id = ? THEN u2.avatar ELSE u1.avatar END as other_user_avatar
           FROM conversations c
           LEFT JOIN users u1 ON c.user1_id = u1.id
           LEFT JOIN users u2 ON c.user2_id = u2.id
           WHERE c.user1_id = ? OR c.user2_id = ?
           ORDER BY c.last_message_time DESC NULLS LAST`,
          [user_id, user_id, user_id, user_id, user_id]
        );
        return rows;
      }
    } catch (error) {
      console.error('数据库查询失败，使用内存存储:', error.message);
    }
    
    // 数据库不可用时使用内存存储
    // 这里简化处理，实际应用中可能需要更复杂的逻辑
    return Array.from(memoryStore.values())
      .filter(conversation => 
        conversation.user1_id === user_id || conversation.user2_id === user_id
      )
      .sort((a, b) => {
        if (!a.last_message_time) return 1;
        if (!b.last_message_time) return -1;
        return new Date(b.last_message_time) - new Date(a.last_message_time);
      });
  }

  /**
   * 更新会话的未读消息数
   * @param {number} id - 会话ID
   * @param {number} count - 未读消息数
   * @returns {Promise<Object>}
   */
  static async updateUnreadCount(id, count) {
    try {
      if (isDbAvailable()) {
        await executeQuery('UPDATE conversations SET unread_count = ? WHERE id = ?', [count, id]);
        return this.findById(id);
      }
    } catch (error) {
      console.error('数据库更新失败，使用内存存储:', error.message);
    }
    
    // 数据库不可用时使用内存存储
    const conversation = memoryStore.get(id);
    if (conversation) {
      conversation.unread_count = count;
      conversation.updated_at = new Date();
      memoryStore.set(id, conversation);
      return conversation;
    }
    return null;
  }

  /**
   * 删除会话
   * @param {number} id - 会话ID
   * @returns {Promise<boolean>}
   */
  static async delete(id) {
    try {
      if (isDbAvailable()) {
        const [result] = await executeQuery('DELETE FROM conversations WHERE id = ?', [id]);
        return result.affectedRows > 0;
      }
    } catch (error) {
      console.error('数据库删除失败，使用内存存储:', error.message);
    }
    
    // 数据库不可用时使用内存存储
    return memoryStore.delete(id);
  }
}

module.exports = Conversation;