// 文件名：src/models/Message.js
// 用途：消息模型

const { executeQuery, isDbAvailable } = require('../utils/database');

// 内存存储（当数据库不可用时使用）
const memoryStore = new Map();
let autoIncrementId = 1;

class Message {
  /**
   * 创建新消息
   * @param {Object} messageData - 消息数据
   * @returns {Promise<Object>}
   */
  static async create(messageData) {
    const { conversation_id, sender_id, receiver_id, content, type } = messageData;
    
    try {
      if (isDbAvailable()) {
        // 数据库可用时使用数据库
        const [result] = await executeQuery(
          'INSERT INTO messages (conversation_id, sender_id, receiver_id, content, type) VALUES (?, ?, ?, ?, ?)',
          [conversation_id, sender_id, receiver_id, content, type]
        );
        
        // 更新会话的最后消息，同时递增未读计数
        await executeQuery(
          'UPDATE conversations SET last_message = ?, last_message_time = ?, unread_count = COALESCE(unread_count, 0) + 1 WHERE id = ?',
          [content, new Date(), conversation_id]
        );
        
        return this.findById(result.insertId);
      }
    } catch (error) {
      console.error('数据库操作失败，使用内存存储:', error.message);
    }
    
    // 数据库不可用时使用内存存储
    const id = autoIncrementId++;
    const message = {
      id,
      conversation_id,
      sender_id,
      receiver_id,
      content,
      type,
      status: 0,
      created_at: new Date(),
      updated_at: new Date()
    };
    memoryStore.set(id, message);
    return message;
  }

  /**
   * 根据ID查找消息
   * @param {number} id - 消息ID
   * @returns {Promise<Object|null>}
   */
  static async findById(id) {
    try {
      if (isDbAvailable()) {
        const [rows] = await executeQuery('SELECT * FROM messages WHERE id = ?', [id]);
        return rows[0] || null;
      }
    } catch (error) {
      console.error('数据库查询失败，使用内存存储:', error.message);
    }
    
    // 数据库不可用时使用内存存储
    return memoryStore.get(id) || null;
  }

  /**
   * 获取会话的消息列表
   * @param {number} conversation_id - 会话ID
   * @param {number} limit - 限制数量
   * @param {number} offset - 偏移量
   * @returns {Promise<Array>}
   */
  static async getByConversationId(conversation_id, limit = 20, offset = 0) {
    try {
      if (isDbAvailable()) {
        const [rows] = await executeQuery(
          'SELECT *, CASE WHEN is_recalled = 1 THEN \'对方撤回了一条消息\' ELSE content END AS content FROM messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?',
          [conversation_id, limit, offset]
        );
        // 标记已撤回消息
        rows.forEach(r => {
          if (r.is_recalled) {
            r._recalled = true;
          }
        });
        return rows.reverse(); // 按时间正序返回
      }
    } catch (error) {
      console.error('数据库查询失败，使用内存存储:', error.message);
    }

    // 数据库不可用时使用内存存储
    return Array.from(memoryStore.values())
      .filter(message => message.conversation_id === conversation_id)
      .map(m => {
        if (m.is_recalled) {
          return { ...m, content: '对方撤回了一条消息', _recalled: true };
        }
        return m;
      })
      .sort((a, b) => a.created_at - b.created_at)
      .slice(offset, offset + limit);
  }

  /**
   * 撤回消息（2分钟内有效）
   * @param {number} id - 消息ID
   * @param {number} sender_id - 请求撤回的用户ID（必须是发送者）
   * @returns {Promise<{success: boolean, message: string}>}
   */
  static async recall(id, sender_id) {
    try {
      if (isDbAvailable()) {
        // 先查出消息，校验归属和时效
        const [rows] = await executeQuery(
          'SELECT * FROM messages WHERE id = ?', [id]
        );
        if (!rows || rows.length === 0) {
          return { success: false, message: '消息不存在' };
        }
        const msg = rows[0];

        // 校验发送者身份
        if (msg.sender_id !== sender_id) {
          return { success: false, message: '只能撤回自己发送的消息' };
        }

        // 校验是否已撤回
        if (msg.is_recalled) {
          return { success: false, message: '消息已撤回，不可重复操作' };
        }

        // 校验时间：2分钟内
        const elapsed = (Date.now() - new Date(msg.created_at).getTime()) / 1000;
        if (elapsed > 120) {
          return { success: false, message: '超过2分钟，无法撤回' };
        }

        // 执行撤回
        await executeQuery(
          'UPDATE messages SET is_recalled = 1, recalled_at = NOW() WHERE id = ?',
          [id]
        );

        // 返回撤回后的消息（含 conversation_id 方便推送）
        return {
          success: true,
          message: '消息已撤回',
          data: {
            id: msg.id,
            conversation_id: msg.conversation_id,
            sender_id: msg.sender_id,
            receiver_id: msg.receiver_id,
            created_at: msg.created_at
          }
        };
      }
    } catch (error) {
      console.error('撤回消息失败:', error.message);
      return { success: false, message: '撤回失败，请稍后重试' };
    }

    // 内存存储降级
    const msg = memoryStore.get(id);
    if (!msg) return { success: false, message: '消息不存在' };
    if (msg.sender_id !== sender_id) return { success: false, message: '只能撤回自己发送的消息' };
    if (msg.is_recalled) return { success: false, message: '消息已撤回，不可重复操作' };
    const elapsed = (Date.now() - new Date(msg.created_at).getTime()) / 1000;
    if (elapsed > 120) return { success: false, message: '超过2分钟，无法撤回' };

    msg.is_recalled = 1;
    msg.recalled_at = new Date();
    memoryStore.set(id, msg);
    return {
      success: true,
      message: '消息已撤回',
      data: {
        id: msg.id,
        conversation_id: msg.conversation_id,
        sender_id: msg.sender_id,
        receiver_id: msg.receiver_id,
        created_at: msg.created_at
      }
    };
  }

  /**
   * 标记消息为已读
   * @param {number} id - 消息ID
   * @returns {Promise<Object>}
   */
  static async markAsRead(id) {
    try {
      if (isDbAvailable()) {
        await executeQuery('UPDATE messages SET status = 1 WHERE id = ?', [id]);
        return this.findById(id);
      }
    } catch (error) {
      console.error('数据库更新失败，使用内存存储:', error.message);
    }
    
    // 数据库不可用时使用内存存储
    const message = memoryStore.get(id);
    if (message) {
      message.status = 1;
      message.updated_at = new Date();
      memoryStore.set(id, message);
      return message;
    }
    return null;
  }

  /**
   * 标记会话的所有消息为已读
   * @param {number} conversation_id - 会话ID
   * @param {number} user_id - 用户ID（接收者）
   * @returns {Promise<number>}
   */
  static async markAllAsRead(conversation_id, user_id) {
    let affectedRows = 0;
    
    try {
      if (isDbAvailable()) {
        const [result] = await executeQuery(
          'UPDATE messages SET status = 1 WHERE conversation_id = ? AND receiver_id = ? AND status = 0',
          [conversation_id, user_id]
        );
        affectedRows = result.affectedRows;
        
        // 重置会话的未读消息数
        await executeQuery(
          'UPDATE conversations SET unread_count = 0 WHERE id = ?',
          [conversation_id]
        );
        
        return affectedRows;
      }
    } catch (error) {
      console.error('数据库更新失败，使用内存存储:', error.message);
    }
    
    // 数据库不可用时使用内存存储
    Array.from(memoryStore.values())
      .filter(message => 
        message.conversation_id === conversation_id && 
        message.receiver_id === user_id && 
        message.status === 0
      )
      .forEach(message => {
        message.status = 1;
        message.updated_at = new Date();
        memoryStore.set(message.id, message);
        affectedRows++;
      });
    
    return affectedRows;
  }

  /**
   * 获取用户的未读消息数
   * @param {number} user_id - 用户ID
   * @returns {Promise<number>}
   */
  static async getUnreadCount(user_id) {
    try {
      if (isDbAvailable()) {
        const [rows] = await executeQuery(
          'SELECT COUNT(*) as count FROM messages WHERE receiver_id = ? AND status = 0',
          [user_id]
        );
        return rows[0].count;
      }
    } catch (error) {
      console.error('数据库查询失败，使用内存存储:', error.message);
    }
    
    // 数据库不可用时使用内存存储
    return Array.from(memoryStore.values())
      .filter(message => message.receiver_id === user_id && message.status === 0)
      .length;
  }
}

module.exports = Message;