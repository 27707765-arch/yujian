/**
 * 用户兴趣画像模型
 * 存储用户的偏好设置、兴趣向量、行为模式、活跃度等
 * 遵循"DB优先 + 内存降级"模式
 */

const { executeQuery, isDbAvailable } = require('../utils/database');

// 内存存储
const memoryStore = new Map();

class UserInterestProfile {
  /**
   * 根据用户ID查找画像
   * @param {number} userId - 用户ID
   * @returns {Promise<Object|null>}
   */
  static async findByUserId(userId) {
    try {
      if (isDbAvailable()) {
        const [rows] = await executeQuery(
          'SELECT * FROM user_interest_profiles WHERE user_id = ?',
          [userId]
        );
        return rows[0] || null;
      }
    } catch (err) {
      console.error('数据库查询兴趣画像失败，使用内存存储:', err.message);
    }
    return memoryStore.get(userId) || null;
  }

  /**
   * 创建或更新用户兴趣画像
   * @param {number} userId - 用户ID
   * @param {Object} data - 画像数据
   * @returns {Promise<Object>}
   */
  static async createOrUpdate(userId, data = {}) {
    const defaults = {
      interest_vector: null,
      behavior_pattern: null,
      preference_age_min: 18,
      preference_age_max: 35,
      preference_distance: 50,
      preference_gender: null,
      last_active_at: new Date(),
      activity_score: 0,
      popularity_score: 0
    };

    try {
      if (isDbAvailable()) {
        const existing = await this.findByUserId(userId);
        if (existing) {
          const fields = [];
          const values = [];
          Object.entries({ ...data, last_active_at: new Date() }).forEach(([key, value]) => {
            if (defaults.hasOwnProperty(key)) {
              fields.push(`\`${key}\` = ?`);
              values.push(value !== undefined ? value : defaults[key]);
            }
          });
          values.push(userId);
          await executeQuery(
            `UPDATE user_interest_profiles SET ${fields.join(', ')} WHERE user_id = ?`,
            values
          );
        } else {
          const insertData = { ...defaults, ...data, user_id: userId, last_active_at: new Date() };
          const fields = Object.keys(insertData);
          const values = Object.values(insertData);
          const placeholders = fields.map(() => '?').join(', ');
          await executeQuery(
            `INSERT INTO user_interest_profiles (${fields.join(', ')}) VALUES (${placeholders})`,
            values
          );
        }
        return this.findByUserId(userId);
      }
    } catch (err) {
      console.error('数据库操作兴趣画像失败，使用内存存储:', err.message);
    }

    // 内存降级
    const profile = memoryStore.has(userId)
      ? { ...memoryStore.get(userId), ...data, updated_at: new Date() }
      : { ...defaults, ...data, user_id: userId, updated_at: new Date() };
    memoryStore.set(userId, profile);
    return profile;
  }

  /**
   * 更新活跃度评分
   * @param {number} userId - 用户ID
   * @param {number} score - 活跃度评分(0-100)
   * @returns {Promise<Object|null>}
   */
  static async updateActivityScore(userId, score) {
    try {
      if (isDbAvailable()) {
        await executeQuery(
          'UPDATE user_interest_profiles SET activity_score = ?, last_active_at = NOW() WHERE user_id = ?',
          [score, userId]
        );
      }
    } catch (err) {
      console.error('更新活跃度评分失败:', err.message);
    }
    // 内存降级
    const profile = memoryStore.get(userId);
    if (profile) {
      profile.activity_score = score;
      profile.last_active_at = new Date();
      profile.updated_at = new Date();
    }
    return this.findByUserId(userId);
  }

  /**
   * 更新受欢迎度评分
   * @param {number} userId - 用户ID
   * @param {number} score - 受欢迎度评分(0-100)
   * @returns {Promise<Object|null>}
   */
  static async updatePopularityScore(userId, score) {
    try {
      if (isDbAvailable()) {
        await executeQuery(
          'UPDATE user_interest_profiles SET popularity_score = ? WHERE user_id = ?',
          [score, userId]
        );
      }
    } catch (err) {
      console.error('更新受欢迎度评分失败:', err.message);
    }
    // 内存降级
    const profile = memoryStore.get(userId);
    if (profile) {
      profile.popularity_score = score;
      profile.updated_at = new Date();
    }
    return this.findByUserId(userId);
  }
}

module.exports = UserInterestProfile;
