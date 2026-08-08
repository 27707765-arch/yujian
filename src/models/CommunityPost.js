/**
 * 圈子帖子模型
 */
const { executeQuery, isDbAvailable } = require('../utils/database');
const { parseImagesField } = require('../utils/upload');

const memoryStore = new Map();
let autoIncrementId = 1;

class CommunityPost {
  static async create(communityId, userId, content, images) {
    try {
      if (isDbAvailable()) {
        const [result] = await executeQuery(
          'INSERT INTO community_posts (community_id, user_id, content, images) VALUES (?,?,?,?)',
          [communityId, userId, content, images && images.length ? JSON.stringify(images) : null]
        );
        await executeQuery('UPDATE communities SET post_count = post_count + 1 WHERE id = ?', [communityId]);
        return this.getDetail(result.insertId);
      }
    } catch (e) { console.error('创建圈子帖子失败:', e.message); }
    const id = autoIncrementId++;
    const p = { id, community_id: communityId, user_id: userId, content, images, like_count: 0, comment_count: 0, is_pinned: 0, status: 1, created_at: new Date() };
    memoryStore.set(id, p);
    return p;
  }

  static async getByCommunity(communityId, { limit = 20, offset = 0 } = {}) {
    try {
      if (isDbAvailable()) {
        const [rows] = await executeQuery(
          'SELECT p.*, u.nickname, u.avatar FROM community_posts p LEFT JOIN users u ON p.user_id = u.id WHERE p.community_id = ? AND p.status = 1 ORDER BY p.is_pinned DESC, p.created_at DESC LIMIT ? OFFSET ?',
          [communityId, limit, offset]
        );
        rows.forEach(r => { r.images = parseImagesField(r.images); });
        return rows;
      }
    } catch (e) {}
    return Array.from(memoryStore.values()).filter(p => p.community_id === communityId && p.status === 1)
      .sort((a, b) => (b.is_pinned - a.is_pinned) || (new Date(b.created_at) - new Date(a.created_at))).slice(offset, offset + limit);
  }

  static async getDetail(id) {
    try {
      if (isDbAvailable()) {
        const [rows] = await executeQuery(
          'SELECT p.*, u.nickname, u.avatar FROM community_posts p LEFT JOIN users u ON p.user_id = u.id WHERE p.id = ?', [id]
        );
        if (rows[0]) rows[0].images = parseImagesField(rows[0].images);
        return rows[0] || null;
      }
    } catch (e) {}
    return memoryStore.get(id) || null;
  }

  static async toggleLike(postId) {
    try {
      if (isDbAvailable()) {
        await executeQuery('UPDATE community_posts SET like_count = like_count + 1 WHERE id = ?', [postId]);
      }
    } catch (e) {}
  }

  static async addComment(postId) {
    try {
      if (isDbAvailable()) {
        await executeQuery('UPDATE community_posts SET comment_count = comment_count + 1 WHERE id = ?', [postId]);
      }
    } catch (e) {}
  }
}

module.exports = CommunityPost;
