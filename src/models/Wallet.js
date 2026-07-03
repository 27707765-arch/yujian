/**
 * 用户钱包模型
 * 管理用户金币余额、充值和交易流水
 */

const { executeQuery, isDbAvailable } = require('../utils/database');

// 内存存储（降级 fallback）
const walletMemory = new Map();
const transactionMemory = [];
let txAutoId = 1;

class Wallet {
  /**
   * 获取或创建用户钱包
   * @param {number} userId - 用户ID
   * @returns {Promise<Object>}
   */
  static async getOrCreate(userId) {
    try {
      if (isDbAvailable()) {
        const [rows] = await executeQuery('SELECT * FROM wallets WHERE user_id = ?', [userId]);
        if (rows.length > 0) return rows[0];

        await executeQuery('INSERT INTO wallets (user_id, balance) VALUES (?, 0)', [userId]);
        const [created] = await executeQuery('SELECT * FROM wallets WHERE user_id = ?', [userId]);
        return created[0];
      }
    } catch (err) {
      console.error('数据库查询失败，使用内存存储:', err.message);
    }

    if (!walletMemory.has(userId)) {
      walletMemory.set(userId, {
        user_id: userId, balance: 0, total_recharge: 0,
        total_spent: 0, total_earned: 0,
        created_at: new Date(), updated_at: new Date()
      });
    }
    return walletMemory.get(userId);
  }

  /**
   * 获取钱包余额
   * @param {number} userId - 用户ID
   * @returns {Promise<number>}
   */
  static async getBalance(userId) {
    const wallet = await this.getOrCreate(userId);
    return wallet.balance;
  }

  /**
   * 充值金币
   * @param {number} userId - 用户ID
   * @param {number} amount - 金币数量
   * @param {string} referenceType - 关联类型
   * @param {number} referenceId - 关联记录ID
   * @returns {Promise<Object>}
   */
  static async recharge(userId, amount, referenceType = 'order', referenceId = null) {
    if (amount <= 0) throw new Error('充值金额必须大于0');

    try {
      if (isDbAvailable()) {
        // 原子操作：balance = balance + amount，消除读-改-写竞态
        // 若用户钱包行不存在，先通过 getOrCreate 确保行存在
        await this.getOrCreate(userId);
        await executeQuery(
          'UPDATE wallets SET balance = balance + ?, total_recharge = total_recharge + ?, updated_at = NOW() WHERE user_id = ?',
          [amount, amount, userId]
        );
        const wallet = await this.getOrCreate(userId);
        await this.addTransaction(userId, 'recharge', amount, wallet.balance, referenceType, referenceId, '金币充值');
        return wallet;
      }
    } catch (err) {
      console.error('数据库操作失败:', err.message);
    }

    // 内存降级（JS单线程天然原子）
    const wallet = await this.getOrCreate(userId);
    wallet.balance += amount;
    wallet.total_recharge += amount;
    wallet.updated_at = new Date();
    walletMemory.set(userId, wallet);
    // 记录交易流水
    transactionMemory.push({
      id: txAutoId++, user_id: userId, type: 'recharge', amount, balance_after: wallet.balance,
      reference_type: referenceType, reference_id: referenceId,
      description: '金币充值', created_at: new Date()
    });
    return wallet;
  }

  /**
   * 消费金币（购买礼物等）
   * @param {number} userId - 用户ID
   * @param {number} amount - 金币数量
   * @param {string} type - 消费类型
   * @param {string} referenceType - 关联类型
   * @param {number} referenceId - 关联记录ID
   * @returns {Promise<Object>} - { success, balance, message }
   */
  static async spend(userId, amount, type = 'gift_send', referenceType = null, referenceId = null) {
    try {
      if (isDbAvailable()) {
        // 原子操作：balance = balance - amount，WHERE balance >= amount 保证不会超扣
        const [result] = await executeQuery(
          'UPDATE wallets SET balance = balance - ?, total_spent = total_spent + ?, updated_at = NOW() WHERE user_id = ? AND balance >= ?',
          [amount, amount, userId, amount]
        );
        if (result.affectedRows === 0) {
          // 可能是余额不足或钱包行不存在，获取钱包确认原因
          const wallet = await this.getOrCreate(userId);
          if (wallet.balance < amount) {
            return { success: false, balance: wallet.balance, message: '金币不足，请充值' };
          }
        }
        const wallet = await this.getOrCreate(userId);
        await this.addTransaction(userId, type, -amount, wallet.balance, referenceType, referenceId, '赠送礼物');
        return { success: true, balance: wallet.balance, message: '消费成功' };
      }
    } catch (err) {
      console.error('数据库操作失败:', err.message);
    }

    // 内存降级（JS单线程天然原子）
    const wallet = await this.getOrCreate(userId);
    if (wallet.balance < amount) {
      return { success: false, balance: wallet.balance, message: '金币不足，请充值' };
    }
    wallet.balance -= amount;
    wallet.total_spent += amount;
    wallet.updated_at = new Date();
    walletMemory.set(userId, wallet);
    transactionMemory.push({
      id: txAutoId++, user_id: userId, type, amount: -amount, balance_after: wallet.balance,
      reference_type: referenceType, reference_id: referenceId,
      description: '赠送礼物', created_at: new Date()
    });
    return { success: true, balance: wallet.balance, message: '消费成功' };
  }

  /**
   * 收入金币（收到礼物）
   * @param {number} userId - 用户ID
   * @param {number} amount - 金币数量
   * @param {number} referenceId - 礼物记录ID
   * @returns {Promise<Object>}
   */
  static async earn(userId, amount, referenceId = null) {
    try {
      if (isDbAvailable()) {
        // 原子操作：balance = balance + amount，消除读-改-写竞态
        await this.getOrCreate(userId);
        await executeQuery(
          'UPDATE wallets SET balance = balance + ?, total_earned = total_earned + ?, updated_at = NOW() WHERE user_id = ?',
          [amount, amount, userId]
        );
        const wallet = await this.getOrCreate(userId);
        await this.addTransaction(userId, 'gift_receive', amount, wallet.balance, 'gift_record', referenceId, '收到礼物');
        return wallet;
      }
    } catch (err) {
      console.error('数据库操作失败:', err.message);
    }

    // 内存降级（JS单线程天然原子）
    const wallet = await this.getOrCreate(userId);
    wallet.balance += amount;
    wallet.total_earned += amount;
    wallet.updated_at = new Date();
    walletMemory.set(userId, wallet);
    transactionMemory.push({
      id: txAutoId++, user_id: userId, type: 'gift_receive', amount, balance_after: wallet.balance,
      reference_type: 'gift_record', reference_id: referenceId,
      description: '收到礼物', created_at: new Date()
    });
    return wallet;
  }

  // ==================== 交易流水 ====================

  /**
   * 添加交易流水
   */
  static async addTransaction(userId, type, amount, balanceAfter, referenceType, referenceId, description) {
    try {
      if (isDbAvailable()) {
        await executeQuery(
          'INSERT INTO coin_transactions (user_id, type, amount, balance_after, reference_type, reference_id, description) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [userId, type, amount, balanceAfter, referenceType, referenceId, description]
        );
        return;
      }
    } catch (err) {
      console.error('流水记录失败:', err.message);
    }
    transactionMemory.push({
      id: txAutoId++, user_id: userId, type, amount, balance_after: balanceAfter,
      reference_type: referenceType, reference_id: referenceId,
      description, created_at: new Date()
    });
  }

  /**
   * 获取交易流水
   * @param {number} userId - 用户ID
   * @param {number} limit - 限制数量
   * @param {number} offset - 偏移量
   * @returns {Promise<Array>}
   */
  static async getTransactions(userId, limit = 20, offset = 0) {
    try {
      if (isDbAvailable()) {
        const [rows] = await executeQuery(
          'SELECT * FROM coin_transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?',
          [userId, limit, offset]
        );
        return rows;
      }
    } catch (err) {
      console.error('数据库查询失败:', err.message);
    }
    return transactionMemory
      .filter(t => t.user_id === userId)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(offset, offset + limit);
  }

  /**
   * 获取消费统计
   * @param {number} userId - 用户ID
   * @returns {Promise<Object>}
   */
  static async getStats(userId) {
    const wallet = await this.getOrCreate(userId);

    // 按类型统计
    let sentTotal = 0, receivedTotal = 0;
    try {
      if (isDbAvailable()) {
        const [sent] = await executeQuery(
          'SELECT COALESCE(SUM(total_price), 0) as total FROM gift_records WHERE sender_id = ?', [userId]
        );
        const [received] = await executeQuery(
          'SELECT COALESCE(SUM(total_price), 0) as total FROM gift_records WHERE receiver_id = ?', [userId]
        );
        sentTotal = sent[0].total;
        receivedTotal = received[0].total;
      }
    } catch (err) {
      // 忽略
    }

    return {
      balance: wallet.balance,
      total_recharge: wallet.total_recharge,
      total_spent: sentTotal,
      total_earned: receivedTotal,
      gift_sent_count: 0, // TODO: count from gift_records
      gift_received_count: 0
    };
  }
}

module.exports = Wallet;
