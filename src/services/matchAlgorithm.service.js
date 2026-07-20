/**
 * 智能匹配算法服务
 * 多维度评分：地理位置(25%) + 年龄(15%) + 兴趣标签(25%) + 活跃度(15%) + 认证等级(10%) + 受欢迎度(10%)
 * 用于对推荐用户列表进行智能排序
 */

const UserInterestProfile = require('../models/UserInterestProfile');
const UserBehavior = require('../models/UserBehavior');

class MatchAlgorithm {
  /**
   * 计算两名用户的匹配分数（0-100）
   * @param {Object} currentUser - 当前用户完整对象
   * @param {Object} candidate - 候选用户完整对象
   * @returns {Promise<Object>} - { score, breakdown }
   */
  static async calculateMatchScore(currentUser, candidate) {
    const breakdown = {};
    let totalScore = 0;

    // 1. 地理位置评分 (25%)
    const locationScore = this.calculateLocationScore(currentUser, candidate);
    breakdown.location = locationScore;
    totalScore += locationScore * 0.25;

    // 2. 年龄匹配评分 (15%)
    const ageScore = this.calculateAgeScore(currentUser, candidate);
    breakdown.age = ageScore;
    totalScore += ageScore * 0.15;

    // 3. 兴趣标签评分 (25%)
    const interestScore = this.calculateInterestScore(currentUser, candidate);
    breakdown.interest = interestScore;
    totalScore += interestScore * 0.25;

    // 4. 活跃度评分 (15%)
    const activityScore = this.calculateActivityScore(candidate);
    breakdown.activity = activityScore;
    totalScore += activityScore * 0.15;

    // 5. 认证等级评分 (10%)
    const verificationScore = this.calculateVerificationScore(candidate);
    breakdown.verification = verificationScore;
    totalScore += verificationScore * 0.10;

    // 6. 受欢迎度评分 (10%)
    const popularityScore = this.calculatePopularityScore(candidate);
    breakdown.popularity = popularityScore;
    totalScore += popularityScore * 0.10;

    return {
      score: Math.round(totalScore * 100) / 100,
      breakdown
    };
  }

  /**
   * 地理位置评分
   * 同城80分，同省50分，其他20分；距离越近分数越高
   */
  static calculateLocationScore(userA, userB) {
    if (userA.city && userB.city && userA.city === userB.city) {
      let score = 80;
      if (userA.lat && userA.lng && userB.lat && userB.lng) {
        const distance = this.calculateDistance(
          parseFloat(userA.lat), parseFloat(userA.lng),
          parseFloat(userB.lat), parseFloat(userB.lng)
        );
        // 每5km扣10分，最低50分
        const distancePenalty = Math.floor(distance / 5) * 10;
        score = Math.max(50, score - distancePenalty);
      }
      return score;
    }
    if (userA.province && userB.province && userA.province === userB.province) return 50;
    return 20;
  }

  /**
   * 年龄匹配评分
   * 年龄差≤3岁100分，≤5岁80分，≤8岁60分，≤10岁40分，>10岁20分
   */
  static calculateAgeScore(userA, userB) {
    if (!userA.age || !userB.age) return 50; // 无年龄信息返回中间值
    const diff = Math.abs(userA.age - userB.age);
    if (diff <= 3) return 100;
    if (diff <= 5) return 80;
    if (diff <= 8) return 60;
    if (diff <= 10) return 40;
    return 20;
  }

  /**
   * 兴趣标签Jaccard相似度
   * 交集/并集 × 100，无标签返回50（中性分）
   */
  static calculateInterestScore(userA, userB) {
    const tagsA = this.parseTags(userA.tags);
    const tagsB = this.parseTags(userB.tags);
    if (tagsA.length === 0 || tagsB.length === 0) return 50;
    const setA = new Set(tagsA);
    const setB = new Set(tagsB);
    const intersection = new Set([...setA].filter(x => setB.has(x)));
    const union = new Set([...setA, ...setB]);
    const jaccard = intersection.size / union.size;
    return Math.round(jaccard * 100);
  }

  /**
   * 活跃度评分
   * 基于用户的认证等级、VIP状态、动态数等综合评估
   */
  static calculateActivityScore(user) {
    let score = 30; // 基础分
    const level = user.verification_level || 0;
    score += level * 10; // 每项认证+10分
    if (user.is_vip) score += 20; // VIP用户+20分
    if (user.photos_count && user.photos_count > 0) score += Math.min(user.photos_count * 3, 15); // 照片+分，最多15
    if (user.bio && user.bio.length >= 10) score += 15; // 有详细简介+15分
    return Math.min(100, score); // 封顶100
  }

  /**
   * 认证等级评分
   * 0项认证20分，1项40分，2项60分，3项80分，4项100分
   */
  static calculateVerificationScore(user) {
    const level = user.verification_level || 0;
    if (level >= 4) return 100;
    if (level === 3) return 80;
    if (level === 2) return 60;
    if (level === 1) return 40;
    return 20;
  }

  /**
   * 受欢迎度评分
   * 从用户兴趣画像中获取，默认50分
   */
  static calculatePopularityScore(user) {
    if (user.popularity_score) return Math.min(100, user.popularity_score);
    // 根据资料完整度估算
    let score = 20;
    if (user.avatar) score += 20;
    if (user.bio) score += 15;
    if (user.tags) {
      const tags = this.parseTags(user.tags);
      score += Math.min(tags.length * 5, 25);
    }
    if (user.photos_count && user.photos_count > 0) score += Math.min(user.photos_count * 4, 20);
    return Math.min(100, score);
  }

  /**
   * Haversine公式计算两点距离（km）
   * @param {number} lat1 - 纬度1
   * @param {number} lng1 - 经度1
   * @param {number} lat2 - 纬度2
   * @param {number} lng2 - 经度2
   * @returns {number} - 距离（km）
   */
  static calculateDistance(lat1, lng1, lat2, lng2) {
    const R = 6371; // 地球半径（km）
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  /**
   * 对候选用户列表按匹配分数排序（批量，限制前20个用户计算分数）
   * @param {Object} currentUser - 当前用户
   * @param {Array} candidates - 候选用户列表
   * @returns {Promise<Array>} - 带 _match_score 字段的排序后列表
   */
  static async reRankUsers(currentUser, candidates) {
    if (!candidates || candidates.length === 0) return [];

    // 限制同时计算分数的用户数（性能考虑）
    const toScore = candidates.slice(0, 20);

    const scored = await Promise.all(
      toScore.map(async (candidate) => {
        try {
          const result = await this.calculateMatchScore(currentUser, candidate);
          return { ...candidate, _match_score: result.score, _score_breakdown: result.breakdown };
        } catch (err) {
          console.error(`计算用户${candidate.id}匹配分数失败:`, err.message);
          return { ...candidate, _match_score: 0 };
        }
      })
    );

    // 按分数降序排列
    scored.sort((a, b) => (b._match_score || 0) - (a._match_score || 0));
    return scored;
  }

  /**
   * 安全解析用户 tags 字段
   * @param {*} tagsField - 可能是 JSON 字符串、数组 或 null
   * @returns {string[]}
   */
  static parseTags(tagsField) {
    if (!tagsField) return [];
    if (Array.isArray(tagsField)) return tagsField;
    if (typeof tagsField === 'string') {
      try {
        const parsed = JSON.parse(tagsField);
        return Array.isArray(parsed) ? parsed : [];
      } catch (e) {
        return [];
      }
    }
    return [];
  }

  /**
   * 记录用户行为（异步fire-and-forget，不阻塞主流程）
   * @param {number} userId - 用户ID
   * @param {number} targetUserId - 目标用户ID
   * @param {string} action - 行为类型
   * @param {Object} opts - 可选参数 { duration, source }
   */
  static recordBehavior(userId, targetUserId, action, opts = {}) {
    UserBehavior.create(userId, targetUserId, action, opts.duration || null, opts.source || null)
      .catch(err => console.error('记录行为失败:', err.message));
  }
}

module.exports = MatchAlgorithm;
