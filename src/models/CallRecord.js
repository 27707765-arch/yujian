/**
 * 通话记录模型
 * 管理语音/视频通话的记录持久化
 * 遵循"DB优先 + 内存降级"模式
 */

const { executeQuery, isDbAvailable } = require('../utils/database');

// 内存存储
const memoryStore = new Map();
let autoIncrementId = 1;

class CallRecord {
  /**
   * 创建通话记录
   * @param {Object} data - 通话数据
   * @param {string} data.channel_name - 频道名
   * @param {number} data.caller_id - 发起方ID
   * @param {number} data.callee_id - 接收方ID
   * @param {string} data.call_type - 通话类型：voice/video
   * @param {string} data.status - 状态：ringing
   * @returns {Promise<Object>}
   */
  static async create(data) {
    const { channel_name, caller_id, callee_id, call_type, status = 'ringing' } = data;
    try {
      if (isDbAvailable()) {
        const [result] = await executeQuery(
          'INSERT INTO call_records (channel_name, caller_id, callee_id, call_type, status, started_at) VALUES (?, ?, ?, ?, ?, NOW())',
          [channel_name, caller_id, callee_id, call_type, status]
        );
        return this.findById(result.insertId);
      }
    } catch (err) {
      console.error('数据库插入通话记录失败，使用内存存储:', err.message);
    }

    // 内存降级
    const id = autoIncrementId++;
    const record = {
      id, channel_name, caller_id, callee_id, call_type, status,
      started_at: new Date(),
      connected_at: null,
      ended_at: null,
      duration: 0,
      end_reason: null,
      created_at: new Date()
    };
    memoryStore.set(id, record);
    return record;
  }

  /**
   * 根据ID查找通话记录
   * @param {number} id - 记录ID
   * @returns {Promise<Object|null>}
   */
  static async findById(id) {
    try {
      if (isDbAvailable()) {
        const [rows] = await executeQuery('SELECT * FROM call_records WHERE id = ?', [id]);
        return rows[0] || null;
      }
    } catch (err) {
      console.error('数据库查询通话记录失败，使用内存存储:', err.message);
    }
    return memoryStore.get(id) || null;
  }

  /**
   * 更新通话记录
   * @param {number} id - 记录ID
   * @param {Object} data - 更新数据
   * @returns {Promise<Object|null>}
   */
  static async update(id, data) {
    try {
      if (isDbAvailable()) {
        const fields = [];
        const values = [];
        Object.entries(data).forEach(([key, value]) => {
          const allowedCols = ['status', 'connected_at', 'ended_at', 'duration', 'end_reason'];
          if (allowedCols.includes(key)) {
            fields.push(`\`${key}\` = ?`);
            values.push(value);
          }
        });
        if (fields.length > 0) {
          values.push(id);
          await executeQuery(
            `UPDATE call_records SET ${fields.join(', ')} WHERE id = ?`,
            values
          );
        }
        return this.findById(id);
      }
    } catch (err) {
      console.error('数据库更新通话记录失败，使用内存存储:', err.message);
    }

    // 内存降级
    const record = memoryStore.get(id);
    if (record) {
      Object.assign(record, data);
      memoryStore.set(id, record);
    }
    return record || null;
  }

  /**
   * 获取用户通话历史
   * @param {number} userId - 用户ID
   * @param {number} limit - 每页数量
   * @param {number} offset - 偏移量
   * @returns {Promise<Array>}
   */
  static async getUserCalls(userId, limit = 20, offset = 0) {
    try {
      if (isDbAvailable()) {
        const [rows] = await executeQuery(
          `SELECT * FROM call_records
           WHERE caller_id = ? OR callee_id = ?
           ORDER BY created_at DESC LIMIT ? OFFSET ?`,
          [userId, userId, limit, offset]
        );
        return rows;
      }
    } catch (err) {
      console.error('数据库查询通话历史失败，使用内存存储:', err.message);
    }

    // 内存降级
    return Array.from(memoryStore.values())
      .filter(r => r.caller_id === userId || r.callee_id === userId)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(offset, offset + limit);
  }

  /**
   * 查找进行中的通话（频道名）
   * @param {string} channelName - 频道名
   * @returns {Promise<Object|null>}
   */
  static async findByChannelName(channelName) {
    try {
      if (isDbAvailable()) {
        const [rows] = await executeQuery(
          'SELECT * FROM call_records WHERE channel_name = ? ORDER BY created_at DESC LIMIT 1',
          [channelName]
        );
        return rows[0] || null;
      }
    } catch (err) {
      console.error('数据库查询通话频道失败:', err.message);
    }
    for (const record of memoryStore.values()) {
      if (record.channel_name === channelName) return record;
    }
    return null;
  }
}

module.exports = CallRecord;
