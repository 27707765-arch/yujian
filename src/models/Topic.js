/**
 * 话题模型
 */
const { executeQuery, isDbAvailable } = require('../utils/database');

const memoryStore = new Map();
let autoIncrementId = 1;

class Topic {
  static async findOrCreateByName(name) {
    const cleanName = name.replace(/^#|#$/g, '').trim();
    if (!cleanName) return null;
    try {
      if (isDbAvailable()) {
        let [rows] = await executeQuery('SELECT id FROM topics WHERE name = ?', [cleanName]);
        if (rows[0]) return rows[0].id;
        await executeQuery('INSERT INTO topics (name) VALUES (?)', [cleanName]);
        [rows] = await executeQuery('SELECT id FROM topics WHERE name = ?', [cleanName]);
        return rows[0] ? rows[0].id : null;
      }
    } catch (e) { console.error('话题查询失败:', e.message); }
    for (const [k, v] of memoryStore) { if (v.name === cleanName) return v.id; }
    const id = autoIncrementId++;
    memoryStore.set(id, { id, name: cleanName, post_count: 0 });
    return id;
  }

  static async getHotTopics(limit = 20) {
    try {
      if (isDbAvailable()) {
        const [rows] = await executeQuery('SELECT * FROM topics ORDER BY post_count DESC LIMIT ?', [limit]);
        return rows;
      }
    } catch (e) {}
    return Array.from(memoryStore.values()).sort((a, b) => b.post_count - a.post_count).slice(0, limit);
  }

  static async incrementPostCount(topicId) {
    try {
      if (isDbAvailable()) {
        await executeQuery('UPDATE topics SET post_count = post_count + 1 WHERE id = ?', [topicId]);
      }
    } catch (e) {}
  }

  static async searchByName(keyword) {
    try {
      if (isDbAvailable()) {
        const [rows] = await executeQuery('SELECT * FROM topics WHERE name LIKE ? LIMIT 20', [`%${keyword}%`]);
        return rows;
      }
    } catch (e) {}
    return [];
  }

  /**
   * 批量关联帖子与话题
   */
  static async linkPost(postId, topicIds) {
    if (!topicIds || topicIds.length === 0) return;
    try {
      if (isDbAvailable()) {
        const values = topicIds.map(tid => `(${postId}, ${tid})`).join(',');
        await executeQuery(`INSERT IGNORE INTO post_topics (post_id, topic_id) VALUES ${values}`);
      }
    } catch (e) { /* 静默 */ }
  }
}

module.exports = Topic;
