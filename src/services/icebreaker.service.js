/**
 * 破冰话题服务
 * 根据匹配用户共同兴趣生成破冰话题
 */
const { executeQuery, isDbAvailable } = require('../utils/database');

class IcebreakerService {
  /** 根据标签/城市/职业替换模板变量 */
  static fillTemplate(template, user, partner) {
    let text = template;
    // 解析 tags
    let userTags = [];
    if (user.tags) {
      try { userTags = typeof user.tags === 'string' ? JSON.parse(user.tags) : user.tags; } catch(e) {}
    }
    let partnerTags = [];
    if (partner.tags) {
      try { partnerTags = typeof partner.tags === 'string' ? JSON.parse(partner.tags) : partner.tags; } catch(e) {}
    }
    const commonTags = userTags.filter(t => partnerTags.includes(t));
    text = text.replace(/\{tag\}/g, commonTags[0] || '共同兴趣');
    text = text.replace(/\{city\}/g, partner.city || partner.location || '这座城市');
    text = text.replace(/\{job\}/g, partner.occupation || '这个行业');
    return text;
  }

  /** 获取匹配破冰话题 */
  static async getTopicsForMatch(matchId, user, partner) {
    try {
      if (!isDbAvailable()) return [];
      // 从已存储的 match_icebreakers 读取
      const [rows] = await executeQuery(
        'SELECT topics FROM match_icebreakers WHERE match_id = ?', [matchId]
      );
      if (rows[0] && rows[0].topics) {
        try { return typeof rows[0].topics === 'string' ? JSON.parse(rows[0].topics) : rows[0].topics; } catch(e) {}
      }
      return [];
    } catch(e) { return []; }
  }

  /** 匹配成功后自动生成破冰话题 */
  static async generateForMatch(matchId, user1, user2) {
    try {
      if (!isDbAvailable()) return [];
      const [rows] = await executeQuery(
        'SELECT content, category FROM icebreaker_topics WHERE is_active = 1 ORDER BY RAND() LIMIT 5'
      );
      const topics = rows.map(r => ({
        content: IcebreakerService.fillTemplate(r.content, user1, user2),
        category: r.category
      }));
      // 存储
      await executeQuery(
        'INSERT INTO match_icebreakers (match_id, user1_id, user2_id, topics) VALUES (?,?,?,?)',
        [matchId, user1.id, user2.id, JSON.stringify(topics)]
      );
      return topics;
    } catch(e) { return []; }
  }

  /** 获取随机趣味问答 */
  static async getRandomQuestion() {
    try {
      if (!isDbAvailable()) return null;
      const [rows] = await executeQuery(
        'SELECT * FROM icebreaker_questions WHERE is_active = 1 ORDER BY RAND() LIMIT 1'
      );
      return rows[0] || null;
    } catch(e) { return null; }
  }
}

module.exports = IcebreakerService;
