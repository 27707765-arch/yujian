/**
 * 动态模型
 * 支持发布动态、点赞、嵌套评论和话题标签
 */

const { executeQuery, isDbAvailable } = require('../utils/database');

const memoryStore = new Map();
let autoIncrementId = 1;

class Post {
  // ==================== 动态 ====================

  static async create(user_id, { content, images, topics }) {
    const imagesJson = images && images.length > 0 ? JSON.stringify(images) : null;
    const topicsJson = topics && topics.length > 0 ? JSON.stringify(topics) : null;
    try {
      if (isDbAvailable()) {
        const [result] = await executeQuery(
          'INSERT INTO posts (user_id, content, images, topics) VALUES (?, ?, ?, ?)',
          [user_id, content || '', imagesJson, topicsJson]
        );
        return this.findById(result.insertId);
      }
    } catch (err) {
      console.error('数据库操作失败，使用内存存储:', err.message);
    }

    const id = autoIncrementId++;
    const post = {
      id, user_id, content: content || '',
      images: images || [], topics: topics || [],
      like_count: 0, comment_count: 0,
      status: 1, created_at: new Date(), updated_at: new Date()
    };
    memoryStore.set(id, post);
    return post;
  }

  static async findById(id) {
    try {
      if (isDbAvailable()) {
        const [rows] = await executeQuery(
          `SELECT p.*, u.nickname, u.avatar
           FROM posts p LEFT JOIN users u ON p.user_id = u.id
           WHERE p.id = ? AND p.status = 1`, [id]
        );
        if (rows[0]) {
          rows[0].images = rows[0].images ? JSON.parse(rows[0].images) : [];
          rows[0].topics = rows[0].topics ? JSON.parse(rows[0].topics) : [];
        }
        return rows[0] || null;
      }
    } catch (err) {
      console.error('数据库查询失败:', err.message);
    }
    const post = memoryStore.get(id);
    return post && post.status === 1 ? post : null;
  }

  static async getList({ limit = 20, offset = 0, user_id, topic } = {}) {
    try {
      if (isDbAvailable()) {
        let query = `SELECT p.*, u.nickname, u.avatar
          FROM posts p LEFT JOIN users u ON p.user_id = u.id
          WHERE p.status = 1`;
        const params = [];
        if (user_id) {
          query += ' AND p.user_id = ?';
          params.push(user_id);
        }
        if (topic) {
          query += ' AND JSON_CONTAINS(p.topics, ?, "$")';
          params.push(JSON.stringify(topic));
        }
        query += ' ORDER BY p.created_at DESC LIMIT ? OFFSET ?';
        params.push(parseInt(limit), parseInt(offset));
        const [rows] = await executeQuery(query, params);
        rows.forEach(r => {
          r.images = r.images ? JSON.parse(r.images) : [];
          r.topics = r.topics ? JSON.parse(r.topics) : [];
        });
        return rows;
      }
    } catch (err) {
      console.error('数据库查询失败:', err.message);
    }
    return Array.from(memoryStore.values())
      .filter(p => p.status === 1 && (!user_id || p.user_id === user_id) && (!topic || (p.topics || []).includes(topic)))
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(offset, offset + limit);
  }

  // ==================== 点赞 ====================

  /**
   * 点赞动态
   */
  static async toggleLike(postId, userId) {
    try {
      if (isDbAvailable()) {
        // 检查是否已点赞
        const [existing] = await executeQuery(
          'SELECT id FROM post_likes WHERE post_id = ? AND user_id = ?', [postId, userId]
        );
        if (existing.length > 0) {
          // 取消点赞
          await executeQuery('DELETE FROM post_likes WHERE post_id = ? AND user_id = ?', [postId, userId]);
          await executeQuery('UPDATE posts SET like_count = GREATEST(like_count - 1, 0) WHERE id = ?', [postId]);
          return { liked: false, message: '取消点赞' };
        } else {
          // 点赞
          await executeQuery('INSERT INTO post_likes (post_id, user_id) VALUES (?, ?)', [postId, userId]);
          await executeQuery('UPDATE posts SET like_count = like_count + 1 WHERE id = ?', [postId]);
          return { liked: true, message: '点赞成功' };
        }
      }
    } catch (err) {
      console.error('点赞操作失败:', err.message);
    }
    // 内存 fallback - 使用独立的点赞追踪 Map
    if (!this._likesMemory) this._likesMemory = new Map(); // postId -> Set<userId>
    if (!this._likesMemory.has(postId)) {
      this._likesMemory.set(postId, new Set());
    }
    const likes = this._likesMemory.get(postId);
    if (likes.has(userId)) {
      likes.delete(userId);
      return { liked: false, message: '取消点赞' };
    } else {
      likes.add(userId);
      return { liked: true, message: '点赞成功' };
    }
  }

  /**
   * 检查用户是否点赞了动态
   */
  static async hasUserLiked(postId, userId) {
    try {
      if (isDbAvailable()) {
        const [rows] = await executeQuery(
          'SELECT id FROM post_likes WHERE post_id = ? AND user_id = ?', [postId, userId]
        );
        return rows.length > 0;
      }
    } catch (err) {
      console.error('查询点赞状态失败:', err.message);
    }
    return false;
  }

  // ==================== 评论（支持嵌套） ====================

  static async addComment(post_id, user_id, content, parent_id = null) {
    try {
      if (isDbAvailable()) {
        await executeQuery(
          'INSERT INTO post_comments (post_id, user_id, content, parent_id) VALUES (?, ?, ?, ?)',
          [post_id, user_id, content, parent_id]
        );
        await executeQuery('UPDATE posts SET comment_count = comment_count + 1 WHERE id = ?', [post_id]);
      }
    } catch (err) {
      console.error('添加评论失败:', err.message);
    }
  }

  static async getComments(post_id, limit = 50, offset = 0) {
    try {
      if (isDbAvailable()) {
        // 获取顶级评论
        const [comments] = await executeQuery(
          `SELECT pc.*, u.nickname, u.avatar
           FROM post_comments pc LEFT JOIN users u ON pc.user_id = u.id
           WHERE pc.post_id = ? AND pc.parent_id IS NULL
           ORDER BY pc.created_at ASC LIMIT ? OFFSET ?`,
          [post_id, parseInt(limit), parseInt(offset)]
        );

        // 获取每个评论的回复
        for (const comment of comments) {
          const [replies] = await executeQuery(
            `SELECT pc.*, u.nickname, u.avatar
             FROM post_comments pc LEFT JOIN users u ON pc.user_id = u.id
             WHERE pc.parent_id = ? ORDER BY pc.created_at ASC LIMIT 10`,
            [comment.id]
          );
          comment.replies = replies;
        }
        return comments;
      }
    } catch (err) {
      console.error('获取评论失败:', err.message);
    }
    return [];
  }
}

module.exports = Post;
