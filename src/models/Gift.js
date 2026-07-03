/**
 * 虚拟礼物模型
 * 用于管理礼物目录和赠送记录
 */

const { executeQuery, isDbAvailable } = require('../utils/database');
const Wallet = require('./Wallet');
const { cacheGet, cacheSet, cacheDel } = require('../config/redis');

const CACHE_KEY_GIFT_LIST = 'gift:list:active';
const CACHE_TTL_GIFT = 3600; // 礼物列表缓存 1 小时

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
    // ① 先查 Redis 缓存
    try {
      const cached = await cacheGet(CACHE_KEY_GIFT_LIST);
      if (cached) return cached;
    } catch (err) {
      // 缓存读取失败，降级到数据库
    }

    // ② 缓存未命中 → 查数据库
    try {
      if (isDbAvailable()) {
        const [rows] = await executeQuery(
          'SELECT * FROM gifts WHERE is_active = 1 ORDER BY sort_order ASC, id ASC'
        );
        // ③ 写入 Redis 缓存
        if (rows && rows.length > 0) {
          cacheSet(CACHE_KEY_GIFT_LIST, rows, CACHE_TTL_GIFT).catch(() => {});
        }
        return rows;
      }
    } catch (err) {
      console.error('数据库查询失败:', err.message);
    }
    return Array.from(giftMemory.values()).filter(g => g.is_active);
  }

  /**
   * 清除礼物列表缓存（管理员新增/编辑/上下架礼物后调用）
   */
  static async clearListCache() {
    try {
      await cacheDel(CACHE_KEY_GIFT_LIST);
    } catch (err) {
      // 忽略缓存删除失败
    }
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
        // 使用数据库事务保证原子性：扣款 + 创建记录 + 分成 要么全成功，要么全回滚
        const { pool } = require('../config/database');
        const conn = await pool.getConnection();
        try {
          await conn.beginTransaction();

          // 1. 扣款（原子操作，余额不足时抛业务异常）
          const [spendResult] = await conn.execute(
            'UPDATE wallets SET balance = balance - ?, total_spent = total_spent + ?, updated_at = NOW() WHERE user_id = ? AND balance >= ?',
            [totalPrice, totalPrice, senderId, totalPrice]
          );
          if (spendResult.affectedRows === 0) {
            // 确认是否为余额不足
            const [walletRows] = await conn.execute('SELECT balance FROM wallets WHERE user_id = ?', [senderId]);
            const balance = walletRows.length > 0 ? walletRows[0].balance : 0;
            throw new Error(balance < totalPrice ? '金币不足，请充值' : '钱包操作失败');
          }

          // 2. 创建赠送记录
          const [recordResult] = await conn.execute(
            'INSERT INTO gift_records (sender_id, receiver_id, gift_id, quantity, total_price, message, conversation_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [senderId, receiverId, giftId, quantity, totalPrice, message, conversationId]
          );
          const recordId = recordResult.insertId;

          // 扣款流水
          await conn.execute(
            'INSERT INTO coin_transactions (user_id, type, amount, balance_after, reference_type, reference_id, description) SELECT ?, ?, ?, balance, ?, ?, ? FROM wallets WHERE user_id = ?',
            [senderId, 'gift_send', -totalPrice, 'gift_record', recordId, '赠送礼物', senderId]
          );

          // 更新接收者的礼物统计
          await conn.execute(
            'UPDATE users SET gifts_received_count = COALESCE(gifts_received_count, 0) + ? WHERE id = ?',
            [quantity, receiverId]
          );

          // 3. 接收者收入分成（默认70%）
          const shareRatio = parseFloat(process.env.GIFT_SHARE_RATIO);
          const effectiveRatio = isNaN(shareRatio) ? 0.7 : shareRatio;
          const earnAmount = Math.floor(totalPrice * effectiveRatio);
          if (earnAmount > 0) {
            // 确保接收者钱包存在
            await conn.execute('INSERT IGNORE INTO wallets (user_id, balance) VALUES (?, 0)', [receiverId]);
            await conn.execute(
              'UPDATE wallets SET balance = balance + ?, total_earned = total_earned + ?, updated_at = NOW() WHERE user_id = ?',
              [earnAmount, earnAmount, receiverId]
            );
            await conn.execute(
              'INSERT INTO coin_transactions (user_id, type, amount, balance_after, reference_type, reference_id, description) SELECT ?, ?, ?, balance, ?, ?, ? FROM wallets WHERE user_id = ?',
              [receiverId, 'gift_receive', earnAmount, 'gift_record', recordId, '收到礼物', receiverId]
            );
          }

          await conn.commit();

          // 查询完整记录返回
          const [recordRows] = await conn.execute(
            `SELECT gr.*, g.name as gift_name, g.image as gift_image, g.animation_type
             FROM gift_records gr LEFT JOIN gifts g ON gr.gift_id = g.id
             WHERE gr.id = ?`, [recordId]
          );
          return recordRows[0];
        } catch (err) {
          await conn.rollback();
          throw err;
        } finally {
          conn.release();
        }
      }
    } catch (err) {
      // 业务异常（如余额不足）直接抛出，系统异常降级到内存
      if (err.message === '金币不足，请充值' || err.message === '钱包操作失败') {
        throw err;
      }
      console.error('数据库事务失败，降级到内存存储:', err.message);
    }

    // ===== 内存降级流程（数据库不可用时） =====
    const spendResult = await Wallet.spend(senderId, totalPrice, 'gift_send', 'gift_record');
    if (!spendResult.success) {
      throw new Error(spendResult.message);
    }

    const id = recordAutoId++;
    const record = {
      id, sender_id: senderId, receiver_id: receiverId, gift_id: giftId,
      quantity, total_price: totalPrice, message, conversation_id: conversationId,
      created_at: new Date(), gift_name: gift.name, gift_image: gift.image, gift_animation: gift.animation_type
    };
    recordMemory.push(record);

    const shareRatio = parseFloat(process.env.GIFT_SHARE_RATIO);
    const effectiveRatio = isNaN(shareRatio) ? 0.7 : shareRatio;
    const earnAmount = Math.floor(totalPrice * effectiveRatio);
    if (earnAmount > 0) {
      try {
        await Wallet.earn(receiverId, earnAmount, record.id);
      } catch (err) {
        console.error('接收者金币分成失败（已扣款+已记录）:', err.message);
      }
    }

    return record;
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
