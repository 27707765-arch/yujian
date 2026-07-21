/**
 * 社群/圈子模型
 */
const { executeQuery, isDbAvailable } = require('../utils/database');
const memoryStore = new Map();
let autoIncrementId = 1;

class Community {
  static async create(data) {
    try {
      if (isDbAvailable()) {
        const [result] = await executeQuery(
          'INSERT INTO communities (name, description, cover_url, creator_id, tags, join_type) VALUES (?,?,?,?,?,?)',
          [data.name, data.description||null, data.cover_url||null, data.creator_id, JSON.stringify(data.tags||[]), data.join_type||'free']
        );
        return this.findById(result.insertId);
      }
    } catch(e) { console.error('创建圈子失败:', e.message); }
    const id = autoIncrementId++;
    const c = { id, ...data, member_count:1, post_count:0, status:1, created_at: new Date() };
    memoryStore.set(id, c);
    return c;
  }

  static async findById(id) {
    try {
      if (isDbAvailable()) {
        const [rows] = await executeQuery('SELECT * FROM communities WHERE id = ? AND status = 1', [id]);
        return rows[0] || null;
      }
    } catch(e) {}
    return memoryStore.get(id) || null;
  }

  static async getList({ limit = 20, offset = 0, sort = 'hot' } = {}) {
    try {
      if (isDbAvailable()) {
        const orderBy = sort === 'new' ? 'created_at DESC' : 'member_count DESC';
        const [rows] = await executeQuery(
          `SELECT * FROM communities WHERE status = 1 ORDER BY ${orderBy} LIMIT ? OFFSET ?`, [limit, offset]
        );
        return rows;
      }
    } catch(e) {}
    return [];
  }

  static async join(communityId, userId) {
    try {
      if (isDbAvailable()) {
        await executeQuery(
          'INSERT IGNORE INTO community_members (community_id, user_id) VALUES (?,?)', [communityId, userId]
        );
        await executeQuery('UPDATE communities SET member_count = member_count + 1 WHERE id = ?', [communityId]);
      }
    } catch(e) {}
  }

  static async leave(communityId, userId) {
    try {
      if (isDbAvailable()) {
        await executeQuery('DELETE FROM community_members WHERE community_id = ? AND user_id = ?', [communityId, userId]);
        await executeQuery('UPDATE communities SET member_count = GREATEST(member_count - 1, 0) WHERE id = ?', [communityId]);
      }
    } catch(e) {}
  }

  static async getMembers(communityId) {
    try {
      if (isDbAvailable()) {
        const [rows] = await executeQuery(
          'SELECT cm.*, u.nickname, u.avatar FROM community_members cm LEFT JOIN users u ON cm.user_id = u.id WHERE cm.community_id = ? ORDER BY cm.joined_at ASC', [communityId]
        );
        return rows;
      }
    } catch(e) {}
    return [];
  }
}

module.exports = Community;
