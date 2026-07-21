/**
 * 亲密关系模型
 */
const { executeQuery, isDbAvailable } = require('../utils/database');

const memoryStore = new Map();
let autoIncrementId = 1;

class Intimacy {
  static async getOrCreate(user1Id, user2Id) {
    // 确保 user1 < user2
    if (user1Id > user2Id) { [user1Id, user2Id] = [user2Id, user1Id]; }
    try {
      if (isDbAvailable()) {
        let [rows] = await executeQuery(
          'SELECT * FROM intimacies WHERE user1_id = ? AND user2_id = ?', [user1Id, user2Id]
        );
        if (rows[0]) return rows[0];
        await executeQuery(
          'INSERT INTO intimacies (user1_id, user2_id) VALUES (?, ?)', [user1Id, user2Id]
        );
        [rows] = await executeQuery(
          'SELECT * FROM intimacies WHERE user1_id = ? AND user2_id = ?', [user1Id, user2Id]
        );
        return rows[0] || null;
      }
    } catch (e) { console.error('亲密关系查询失败:', e.message); }
    // 内存降级
    for (const v of memoryStore.values()) {
      if ((v.user1_id === user1Id && v.user2_id === user2Id)) return v;
    }
    const id = autoIncrementId++;
    const record = { id, user1_id: user1Id, user2_id: user2Id, score: 0, level: 0, consecutive_days: 0, total_chat_count: 0, total_call_duration: 0, total_gift_value: 0 };
    memoryStore.set(id, record);
    return record;
  }

  static async addScore(intimacyId, actorId, actionType, scoreChange, detail, totalChatCount, totalCallDuration, totalGiftValue) {
    try {
      if (isDbAvailable()) {
        await executeQuery(
          'UPDATE intimacies SET score = score + ?, last_interaction_at = NOW() WHERE id = ?',
          [scoreChange, intimacyId]
        );
        if (totalChatCount !== null && totalChatCount !== undefined) {
          await executeQuery('UPDATE intimacies SET total_chat_count = ? WHERE id = ?', [totalChatCount, intimacyId]);
        }
        if (totalCallDuration !== null && totalCallDuration !== undefined) {
          await executeQuery('UPDATE intimacies SET total_call_duration = ? WHERE id = ?', [totalCallDuration, intimacyId]);
        }
        if (totalGiftValue !== null && totalGiftValue !== undefined) {
          await executeQuery('UPDATE intimacies SET total_gift_value = ? WHERE id = ?', [totalGiftValue, intimacyId]);
        }
        const [rows] = await executeQuery('SELECT * FROM intimacies WHERE id = ?', [intimacyId]);
        const record = rows[0];
        if (!record) return null;

        // 计算等级
        const oldLevel = record.level;
        const newLevel = record.score >= 1000 ? 4 : record.score >= 600 ? 3 : record.score >= 300 ? 2 : record.score >= 100 ? 1 : 0;
        const leveledUp = newLevel > oldLevel;
        if (leveledUp) {
          await executeQuery('UPDATE intimacies SET level = ? WHERE id = ?', [newLevel, intimacyId]);
        }

        // 写入日志
        await executeQuery(
          'INSERT INTO intimacy_logs (intimacy_id, actor_id, action_type, score_change, score_after, detail) VALUES (?,?,?,?,?,?)',
          [intimacyId, actorId, actionType, scoreChange, record.score, detail || '']
        );

        return { ...record, leveledUp, oldLevel, newLevel, newScore: record.score };
      }
    } catch (e) { console.error('增加亲密度失败:', e.message); }
    return null;
  }

  static async updateConsecutive(id, days) {
    try {
      if (isDbAvailable()) {
        await executeQuery('UPDATE intimacies SET consecutive_days = ? WHERE id = ?', [days, id]);
      }
    } catch (e) { /* 静默 */ }
  }

  static async getByUsers(user1Id, user2Id) {
    if (user1Id > user2Id) { [user1Id, user2Id] = [user2Id, user1Id]; }
    try {
      if (isDbAvailable()) {
        const [rows] = await executeQuery(
          'SELECT * FROM intimacies WHERE user1_id = ? AND user2_id = ?', [user1Id, user2Id]
        );
        return rows[0] || null;
      }
    } catch (e) { /* fallback */ }
    return null;
  }
}

module.exports = Intimacy;
