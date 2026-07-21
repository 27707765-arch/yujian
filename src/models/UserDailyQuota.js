/**
 * 用户每日配额模型
 */
const { executeQuery, isDbAvailable } = require('../utils/database');

class UserDailyQuota {
  static async getOrCreate(userId, dateStr) {
    if (!dateStr) dateStr = new Date().toISOString().slice(0, 10);
    try {
      if (isDbAvailable()) {
        let [rows] = await executeQuery(
          'SELECT * FROM user_daily_quotas WHERE user_id = ? AND quota_date = ?', [userId, dateStr]
        );
        if (rows[0]) return rows[0];
        await executeQuery(
          'INSERT INTO user_daily_quotas (user_id, quota_date) VALUES (?, ?)', [userId, dateStr]
        );
        [rows] = await executeQuery(
          'SELECT * FROM user_daily_quotas WHERE user_id = ? AND quota_date = ?', [userId, dateStr]
        );
        return rows[0] || { like_used: 0, super_like_used: 0 };
      }
    } catch (e) { console.error('配额查询失败:', e.message); }
    return { like_used: 0, super_like_used: 0 };
  }

  static async incrementLike(userId) {
    const dateStr = new Date().toISOString().slice(0, 10);
    try {
      if (isDbAvailable()) {
        await this.getOrCreate(userId, dateStr);
        await executeQuery(
          'UPDATE user_daily_quotas SET like_used = like_used + 1 WHERE user_id = ? AND quota_date = ?',
          [userId, dateStr]
        );
        const [rows] = await executeQuery(
          'SELECT like_used FROM user_daily_quotas WHERE user_id = ? AND quota_date = ?', [userId, dateStr]
        );
        return rows[0] ? rows[0].like_used : 0;
      }
    } catch (e) {}
    return 0;
  }

  static async incrementSuperLike(userId) {
    const dateStr = new Date().toISOString().slice(0, 10);
    try {
      if (isDbAvailable()) {
        await this.getOrCreate(userId, dateStr);
        await executeQuery(
          'UPDATE user_daily_quotas SET super_like_used = super_like_used + 1 WHERE user_id = ? AND quota_date = ?',
          [userId, dateStr]
        );
      }
    } catch (e) {}
  }

  /** 检查普通喜欢是否还有配额 */
  static async canLike(userId) {
    const dateStr = new Date().toISOString().slice(0, 10);
    const quota = await this.getOrCreate(userId, dateStr);
    // VIP 不限
    try {
      const User = require('./User');
      const user = await User.findById(userId);
      if (user && (user.is_vip || (user.vip_level > 0 && user.vip_expire_time && new Date(user.vip_expire_time) > new Date()))) return true;
    } catch (e) {}
    return quota.like_used < 20; // 免费用户每日20次
  }

  /** 检查超级喜欢是否还有配额 + 余额充足 */
  static async canSuperLike(userId) {
    const dateStr = new Date().toISOString().slice(0, 10);
    const quota = await this.getOrCreate(userId, dateStr);
    // VIP 不限
    try {
      const User = require('./User');
      const user = await User.findById(userId);
      if (user && (user.is_vip || (user.vip_level > 0 && user.vip_expire_time && new Date(user.vip_expire_time) > new Date()))) return true;
    } catch (e) {}
    return quota.super_like_used < 5;
  }
}

module.exports = UserDailyQuota;
