/**
 * 徽章模型
 */
const { executeQuery, isDbAvailable } = require('../utils/database');

class IntimacyBadge {
  static async getAll() {
    try { if (isDbAvailable()) { const [r] = await executeQuery('SELECT * FROM intimacy_badges ORDER BY id'); return r; } } catch (e) {}
    return [];
  }

  static async getUserBadges(userId) {
    try {
      if (isDbAvailable()) {
        const [r] = await executeQuery(
          'SELECT b.*, ub.unlocked_at FROM user_badges ub JOIN intimacy_badges b ON ub.badge_id = b.id WHERE ub.user_id = ?',
          [userId]
        );
        return r;
      }
    } catch (e) {}
    return [];
  }

  static async checkAndAward(userId, badgeType, triggerData) {
    try {
      if (!isDbAvailable()) return;
      // 检查是否符合徽章条件
      const badges = await this.getAll();
      for (const badge of badges) {
        if (badge.badge_type !== badgeType) continue;
        // 已解锁则跳过
        const [existing] = await executeQuery(
          'SELECT id FROM user_badges WHERE user_id = ? AND badge_id = ?', [userId, badge.id]
        );
        if (existing.length > 0) continue;
        // 判断条件
        const cond = badge.trigger_condition;
        let match = false;
        if (cond === 'chat_100') match = triggerData.totalChatCount >= 100;
        else if (cond === 'chat_500') match = triggerData.totalChatCount >= 500;
        else if (cond === 'call_60min') match = triggerData.totalCallDuration >= 3600;
        else if (cond === 'gift_1000') match = triggerData.totalGiftValue >= 1000;
        if (match) {
          await executeQuery('INSERT INTO user_badges (user_id, badge_id) VALUES (?,?)', [userId, badge.id]);
        }
      }
    } catch (e) { /* 静默 */ }
  }
}

module.exports = IntimacyBadge;
