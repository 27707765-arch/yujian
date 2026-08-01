/**
 * 圈子事件模型
 */
const { executeQuery, isDbAvailable } = require('../utils/database');

const memoryStore = new Map();
let autoIncrementId = 1;

class CommunityEvent {
  static async create(communityId, creatorId, data) {
    try {
      if (isDbAvailable()) {
        const [result] = await executeQuery(
          'INSERT INTO community_events (community_id, creator_id, title, description, location, start_time, max_participants) VALUES (?,?,?,?,?,?,?)',
          [communityId, creatorId, data.title, data.description || null, data.location || null, data.start_time, data.max_participants || null]
        );
        return this.getDetail(result.insertId);
      }
    } catch (e) { console.error('创建圈子事件失败:', e.message); }
    const id = autoIncrementId++;
    const ev = { id, community_id: communityId, creator_id: creatorId, ...data, participant_count: 0, status: 1, created_at: new Date() };
    memoryStore.set(id, ev);
    return ev;
  }

  static async getByCommunity(communityId, { limit = 20, offset = 0 } = {}) {
    try {
      if (isDbAvailable()) {
        const [rows] = await executeQuery(
          'SELECT e.*, u.nickname, u.avatar FROM community_events e LEFT JOIN users u ON e.creator_id = u.id WHERE e.community_id = ? AND e.status = 1 ORDER BY e.start_time ASC LIMIT ? OFFSET ?',
          [communityId, limit, offset]
        );
        return rows;
      }
    } catch (e) {}
    return Array.from(memoryStore.values()).filter(ev => ev.community_id === communityId && ev.status === 1)
      .sort((a, b) => new Date(a.start_time) - new Date(b.start_time)).slice(offset, offset + limit);
  }

  static async getDetail(id) {
    try {
      if (isDbAvailable()) {
        const [rows] = await executeQuery(
          'SELECT e.*, u.nickname, u.avatar FROM community_events e LEFT JOIN users u ON e.creator_id = u.id WHERE e.id = ?', [id]
        );
        return rows[0] || null;
      }
    } catch (e) {}
    return memoryStore.get(id) || null;
  }

  static async join(eventId) {
    try {
      if (isDbAvailable()) {
        await executeQuery('UPDATE community_events SET participant_count = participant_count + 1 WHERE id = ?', [eventId]);
      }
    } catch (e) {}
  }

  static async leave(eventId) {
    try {
      if (isDbAvailable()) {
        await executeQuery('UPDATE community_events SET participant_count = GREATEST(participant_count - 1, 0) WHERE id = ?', [eventId]);
      }
    } catch (e) {}
  }
}

module.exports = CommunityEvent;
