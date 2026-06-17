/**
 * 虚拟礼物模型
 * 用于管理礼物目录和赠送记录
 */

const { executeQuery, isDbAvailable } = require('../utils/database');

// 内存存储（降级 fallback）
const giftMemory = new Map();
const recordMemory = [];
let giftAutoId = 1;
let recordAutoId = 1;

class Gift {
  // ==================== 礼物目录 ====================

  /**
   * 获取所有上架礼物
   * @returns {Promise<Array>}
   */
  static async getAll() {
    try {
      if (isDbAvailable()) {
        const [rows] = await executeQuery(
          'SELECT * FROM gifts WHERE is_active = 1 ORDER BY sort_order ASC, id ASC'
        );
        return rows;
      }
    } catch (err) {
      console.error('数据库查询失败:', err.message);
    }
    return Array.from(giftMemory.values()).filter(g => g.is_active);
  }

  /**
   * 根据ID获取礼物
   * @param {number} id - 礼物ID
   * @returns {Promise<Object|null>}
   */
  static async findById(id) {
    try {
      if (isDbAvailable()) {
        const [rows] = await executeQuery('SELECT * FROM gifts WHERE id = ?', [id]);
        return rows[0] || null;
      }
    } catch (err) {
      console.error('数据库查询失败:', err.message);
    }
    return giftMemory.get(id) || null;
  }

  // ==================== 赠送记录 ====================

  /**
   * 赠送礼物
   * @param {number} senderId - 赠送者ID
   * @param {number} receiverId - 接收者ID
   * @param {number} giftId - 礼物ID
   * @param {number} quantity - 数量
   * @param {string} message - 留言
   * @param {number} conversationId - 会话ID
   * @returns {Promise<Object>}
   */
  static async send(senderId, receiverId, giftId, quantity = 1, message = null, conversationId = null) {
    const gift = await this.findById(giftId);
    if (!gift) throw new Error('礼物不存在');
    if (!gift.is_active) throw new Error('礼物已下架');

    const totalPrice = gift.price * quantity;

    try {
      if (isDbAvailable()) {
        const [result] = await executeQuery(
          'INSERT INTO gift_records (sender_id, receiver_id, gift_id, quantity, total_price, message, conversation_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [senderId, receiverId, giftId, quantity, totalPrice, message, conversationId]
        );
        // 更新接收者的礼物统计（收到礼物数）
        await executeQuery(
          'UPDATE users SET gifts_received_count = COALESCE(gifts_received_count, 0) + ? WHERE id = ?',
          [quantity, receiverId]
        );
        return this.getRecordById(result.insertId);
      }
    } catch (err) {
      console.error('数据库操作失败，使用内存存储:', err.message);
    }

    const id = recordAutoId++;
    const record = {
      id, sender_id: senderId, receiver_id: receiverId, gift_id: giftId,
      quantity, total_price: totalPrice, message, conversation_id: conversationId,
      created_at: new Date()
    };
    recordMemory.push(record);
    return { ...record, gift_name: gift.name, gift_image: gift.image, gift_animation: gift.animation_type };
  }

  /**
   * 获取赠送记录详情
   * @param {number} id - 记录ID
   * @returns {Promise<Object|null>}
   */
  static async getRecordById(id) {
    try {
      if (isDbAvailable()) {
        const [rows] = await executeQuery(
          `SELECT gr.*, g.name as gift_name, g.image as gift_image, g.animation_type
           FROM gift_records gr LEFT JOIN gifts g ON gr.gift_id = g.id
           WHERE gr.id = ?`, [id]
        );
        return rows[0] || null;
      }
    } catch (err) {
      console.error('数据库查询失败:', err.message);
    }
    return recordMemory.find(r => r.id === id) || null;
  }

  /**
   * 获取用户收到的礼物列表
   * @param {number} userId - 用户ID
   * @param {number} limit - 限制数量
   * @param {number} offset - 偏移量
   * @returns {Promise<Array>}
   */
  static async getReceivedGifts(userId, limit = 20, offset = 0) {
    try {
      if (isDbAvailable()) {
        const [rows] = await executeQuery(
          `SELECT gr.*, g.name as gift_name, g.image as gift_image, g.animation_type,
                  u.nickname as sender_nickname, u.avatar as sender_avatar
           FROM gift_records gr
           LEFT JOIN gifts g ON gr.gift_id = g.id
           LEFT JOIN users u ON gr.sender_id = u.id
           WHERE gr.receiver_id = ?
           ORDER BY gr.created_at DESC LIMIT ? OFFSET ?`,
          [userId, limit, offset]
        );
        return rows;
      }
    } catch (err) {
      console.error('数据库查询失败:', err.message);
    }
    return recordMemory.filter(r => r.receiver_id === userId).slice(offset, offset + limit);
  }

  /**
   * 获取用户发送的礼物列表
   * @param {number} userId - 用户ID
   * @param {number} limit - 限制数量
   * @param {number} offset - 偏移量
   * @returns {Promise<Array>}
   */
  static async getSentGifts(userId, limit = 20, offset = 0) {
    try {
      if (isDbAvailable()) {
        const [rows] = await executeQuery(
          `SELECT gr.*, g.name as gift_name, g.image as gift_image,
                  u.nickname as receiver_nickname, u.avatar as receiver_avatar
           FROM gift_records gr
           LEFT JOIN gifts g ON gr.gift_id = g.id
           LEFT JOIN users u ON gr.receiver_id = u.id
           WHERE gr.sender_id = ?
           ORDER BY gr.created_at DESC LIMIT ? OFFSET ?`,
          [userId, limit, offset]
        );
        return rows;
      }
    } catch (err) {
      console.error('数据库查询失败:', err.message);
    }
    return recordMemory.filter(r => r.sender_id === userId).slice(offset, offset + limit);
  }

  /**
   * 获取会话中的礼物记录
   * @param {number} conversationId - 会话ID
   * @param {number} limit - 限制数量
   * @returns {Promise<Array>}
   */
  static async getByConversation(conversationId, limit = 50) {
    try {
      if (isDbAvailable()) {
        const [rows] = await executeQuery(
          `SELECT gr.*, g.name as gift_name, g.image as gift_image
           FROM gift_records gr LEFT JOIN gifts g ON gr.gift_id = g.id
           WHERE gr.conversation_id = ?
           ORDER BY gr.created_at ASC LIMIT ?`,
          [conversationId, limit]
        );
        return rows;
      }
    } catch (err) {
      console.error('数据库查询失败:', err.message);
    }
    return recordMemory.filter(r => r.conversation_id === conversationId).slice(0, limit);
  }
}

module.exports = Gift;
