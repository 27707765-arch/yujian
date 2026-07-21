/**
 * 动态模型
 * 支持发布动态、点赞、嵌套评论和话题标签
 */

const { executeQuery, isDbAvailable } = require('../utils/database');

const memoryStore = new Map();
let autoIncrementId = 1;

class Post {
  // ==================== 动态 ====================

  static async create(user_id, { content, images, topics, video_url, video_duration, video_cover, original_post_id, repost_comment }) {
    const imagesJson = images && images.length > 0 ? JSON.stringify(images) : null;
    const topicsJson = topics && topics.length > 0 ? JSON.stringify(topics) : null;
    try {
      if (isDbAvailable()) {
        const [result] = await executeQuery(
          `INSERT INTO posts (user_id, content, images, topics, video_url, video_duration, video_cover, original_post_id, repost_comment)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [user_id, content || '', imagesJson, topicsJson, video_url || null, video_duration || null, video_cover || null, original_post_id || null, repost_comment || null]
        );
        // 提取话题并关联
        if (content) {
          const Topic = require('./Topic');
          const hashtags = content.match(/#([^#\s]+)#/g);
          if (hashtags) {
            const topicIds = [];
            for (const tag of hashtags) {
              const tid = await Topic.findOrCreateByName(tag);
              if (tid) { topicIds.push(tid); Topic.incrementPostCount(tid).catch(() => {}); }
            }
            if (topicIds.length > 0) { Topic.linkPost(result.insertId, topicIds).catch(() => {}); }
          }
        }
        // 如果是转发，递增原帖转发数
        if (original_post_id) {
          executeQuery('UPDATE posts SET repost_count = repost_count + 1 WHERE id = ?', [original_post_id]).catch(() => {});
        }
        // 计算热度分
        try { const hs = require('../services/hotScore.service'); hs.updatePostScore(result.insertId).catch(() => {}); } catch (e) {}
        return this.findById(result.insertId);
      }
    } catch (err) {
      console.error('数据库操作失败，使用内存存储:', err.message);
    }

    const id = autoIncrementId++;
    const post = {
      id, user_id, content: content || '',
      images: images || [], topics: topics || [],
      video_url: video_url || null, video_duration: video_duration || null, video_cover: video_cover || null,
      like_count: 0, comment_count: 0, view_count: 0, hot_score: 0,
      original_post_id: original_post_id || null, repost_comment: repost_comment || null, repost_count: 0,
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

  static async getList({ limit = 20, offset = 0, user_id, topic, scope, currentUserId, sort = 'latest' } = {}) {
    try {
      if (isDbAvailable()) {
        let query = `SELECT p.*, u.nickname, u.avatar
          FROM posts p LEFT JOIN users u ON p.user_id = u.id
          WHERE p.status = 1`;
        const params = [];
        if (user_id) { query += ' AND p.user_id = ?'; params.push(user_id); }
        if (topic) { query += ' AND JSON_CONTAINS(p.topics, ?, "$")'; params.push(JSON.stringify(topic)); }
        if (scope === 'following' && currentUserId) {
          query += ` AND p.user_id IN (SELECT user2_id AS matched_user_id FROM matches WHERE user1_id = ? UNION SELECT user1_id FROM matches WHERE user2_id = ?)`;
          params.push(currentUserId, currentUserId);
        }
        // 排序
        if (sort === 'hot') query += ' ORDER BY p.hot_score DESC, p.created_at DESC';
        else query += ' ORDER BY p.created_at DESC';
        query += ' LIMIT ? OFFSET ?';
        params.push(parseInt(limit), parseInt(offset));
        const [rows] = await executeQuery(query, params);
        rows.forEach(r => { r.images = r.images ? JSON.parse(r.images) : []; r.topics = r.topics ? JSON.parse(r.topics) : []; });
        return rows;
      }
    } catch (err) { console.error('数据库查询失败:', err.message); }
    return Array.from(memoryStore.values())
      .filter(p => p.status === 1 && (!user_id || p.user_id === user_id) && (!topic || (p.topics || []).includes(topic)))
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(offset, offset + limit);
  }

  /** 收藏切换 */
  static async toggleFavorite(postId, userId) {
    try {
      if (isDbAvailable()) {
        const [rows] = await executeQuery('SELECT id FROM post_favorites WHERE post_id = ? AND user_id = ?', [postId, userId]);
        if (rows[0]) {
          await executeQuery('DELETE FROM post_favorites WHERE id = ?', [rows[0].id]);
          return { favorited: false };
        } else {
          await executeQuery('INSERT INTO post_favorites (post_id, user_id) VALUES (?,?)', [postId, userId]);
          return { favorited: true };
        }
      }
    } catch (e) {}
    return { favorited: false };
  }

  /** 获取用户收藏列表 */
  static async getUserFavorites(userId, limit = 20, offset = 0) {
    try {
      if (isDbAvailable()) {
        const [rows] = await executeQuery(
          `SELECT p.*, u.nickname, u.avatar FROM post_favorites f
           JOIN posts p ON f.post_id = p.id LEFT JOIN users u ON p.user_id = u.id
           WHERE f.user_id = ? AND p.status = 1 ORDER BY f.created_at DESC LIMIT ? OFFSET ?`,
          [userId, limit, offset]
        );
        rows.forEach(r => { r.images = r.images ? JSON.parse(r.images) : []; r.topics = r.topics ? JSON.parse(r.topics) : []; });
        return rows;
      }
    } catch (e) {}
    return [];
  }

  /** 递增浏览量 */
  static async incrementViewCount(postId) {
    try { if (isDbAvailable()) await executeQuery('UPDATE posts SET view_count = view_count + 1 WHERE id = ?', [postId]); } catch (e) {}
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
    // 内存降级：检查 _likesMemory
    if (!this._likesMemory) return false;
    const likes = this._likesMemory.get(postId);
    return likes ? likes.has(userId) : false;
  }

  // ==================== 评论（支持嵌套） ====================

  /**
   * 更新动态（仅限作者本人）
   * @param {number} id - 动态ID
   * @param {number} user_id - 作者ID（校验用）
   * @param {Object} data - { content, images }
   * @returns {Promise<Object|null>}
   */
  static async update(id, user_id, { content, images }) {
    try {
      if (isDbAvailable()) {
        const imagesJson = images && images.length > 0 ? JSON.stringify(images) : null;
        await executeQuery(
          'UPDATE posts SET content = ?, images = ?, edited_at = NOW() WHERE id = ? AND user_id = ? AND status = 1',
          [content || '', imagesJson, id, user_id]
        );
        return this.findById(id);
      }
    } catch (err) {
      console.error('更新动态失败:', err.message);
    }
    // 内存降级
    const post = memoryStore.get(id);
    if (!post || post.user_id !== user_id || post.status !== 1) return null;
    post.content = content || '';
    post.images = images || [];
    post.edited_at = new Date();
    memoryStore.set(id, post);
    return post;
  }

  /**
   * 软删除动态
   * @param {number} id - 动态ID
   * @param {number} user_id - 作者ID
   * @returns {Promise<boolean>}
   */
  static async softDelete(id, user_id) {
    try {
      if (isDbAvailable()) {
        const [result] = await executeQuery(
          'UPDATE posts SET status = 0, edited_at = NOW() WHERE id = ? AND user_id = ? AND status = 1',
          [id, user_id]
        );
        return result.affectedRows > 0;
      }
    } catch (err) {
      console.error('软删除动态失败:', err.message);
    }
    const post = memoryStore.get(id);
    if (!post || post.user_id !== user_id || post.status !== 1) return false;
    post.status = 0;
    post.edited_at = new Date();
    memoryStore.set(id, post);
    return true;
  }

  static async addComment(post_id, user_id, content, parent_id = null) {
    try {
      if (isDbAvailable()) {
        await executeQuery(
          'INSERT INTO post_comments (post_id, user_id, content, parent_id) VALUES (?, ?, ?, ?)',
          [post_id, user_id, content, parent_id]
        );
        await executeQuery('UPDATE posts SET comment_count = comment_count + 1 WHERE id = ?', [post_id]);
        return;
      }
    } catch (err) {
      console.error('添加评论失败:', err.message);
    }

    // 内存降级：保存评论到内存
    if (!this._commentsMemory) this._commentsMemory = new Map(); // postId -> [{id, user_id, content, ...}]
    if (!this._commentsMemory.has(post_id)) this._commentsMemory.set(post_id, []);
    const commentId = (this._commentAutoId = (this._commentAutoId || 0) + 1);
    const comment = {
      id: commentId, post_id, user_id, content, parent_id, parent_id,
      status: 1, created_at: new Date(), updated_at: new Date(),
      nickname: null, avatar: null, replies: []
    };
    if (parent_id) {
      // 找到父评论添加回复
      const comments = this._commentsMemory.get(post_id);
      const parent = comments.find(c => c.id === parent_id);
      if (parent) {
        parent.replies = parent.replies || [];
        parent.replies.push(comment);
      } else {
        comments.push(comment);
      }
    } else {
      this._commentsMemory.get(post_id).push(comment);
    }
    // 更新动态评论数
    const post = memoryStore.get(post_id);
    if (post) post.comment_count = (post.comment_count || 0) + 1;
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

        // 批量获取所有回复（消除 N+1 查询）
        if (comments.length > 0) {
          const parentIds = comments.map(c => c.id);
          const placeholders = parentIds.map(() => '?').join(',');
          const [allReplies] = await executeQuery(
            `SELECT pc.*, u.nickname, u.avatar
             FROM post_comments pc LEFT JOIN users u ON pc.user_id = u.id
             WHERE pc.parent_id IN (${placeholders}) ORDER BY pc.created_at ASC LIMIT 100`,
            parentIds
          );
          // 按 parent_id 分组组装到对应评论
          const replyMap = {};
          allReplies.forEach(r => {
            if (!replyMap[r.parent_id]) replyMap[r.parent_id] = [];
            replyMap[r.parent_id].push(r);
          });
          comments.forEach(c => { c.replies = replyMap[c.id] || []; });
        }
        return comments;
      }
    } catch (err) {
      console.error('获取评论失败:', err.message);
    }

    // 内存降级
    const all = this._commentsMemory ? (this._commentsMemory.get(post_id) || []) : [];
    const topLevel = all.filter(c => c.parent_id === null);
    return topLevel.slice(offset, offset + limit);
  }

  /**
   * 评论点赞/取消
   */
  static async toggleCommentLike(commentId, userId) {
    try {
      if (isDbAvailable()) {
        const [existing] = await executeQuery(
          'SELECT id FROM comment_likes WHERE comment_id = ? AND user_id = ?', [commentId, userId]
        );
        if (existing.length > 0) {
          await executeQuery('DELETE FROM comment_likes WHERE comment_id = ? AND user_id = ?', [commentId, userId]);
          return { liked: false };
        } else {
          await executeQuery('INSERT INTO comment_likes (comment_id, user_id) VALUES (?, ?)', [commentId, userId]);
          return { liked: true };
        }
      }
    } catch (err) {
      console.error('评论点赞失败:', err.message);
    }
    return { liked: false };
  }

  /**
   * 获取评论列表
   */
}

module.exports = Post;
