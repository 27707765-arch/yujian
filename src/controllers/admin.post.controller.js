/**
 * 管理员 - 动态管理控制器
 * 查看所有动态、查看详情、软删除/恢复
 */

const { executeQuery } = require('../utils/database');
const { success, error, serverError } = require('../utils/response');

function safeRows(result) {
  if (!result || !Array.isArray(result)) return [];
  return result;
}

function safeFirst(result, defaultValue = {}) {
  if (!result || !Array.isArray(result) || result.length === 0) return defaultValue;
  return result[0] || defaultValue;
}

/**
 * 获取动态列表（管理员视图，含已删除）
 * GET /api/admin/posts?limit=20&offset=0&status=&keyword=&user_id=
 */
async function getPostList(req, res) {
  try {
    const { limit = 20, offset = 0, status, keyword, user_id } = req.query;
    let query = `SELECT p.*, u.nickname, u.avatar
      FROM posts p LEFT JOIN users u ON p.user_id = u.id WHERE 1=1`;
    const params = [];

    if (status !== undefined && status !== '') {
      query += ' AND p.status = ?';
      params.push(parseInt(status, 10));
    }
    if (keyword) {
      query += ' AND p.content LIKE ?';
      params.push(`%${keyword}%`);
    }
    if (user_id) {
      query += ' AND p.user_id = ?';
      params.push(parseInt(user_id, 10));
    }

    // 总数
    const countQuery = query.replace(/SELECT p\.\*, u\.nickname, u\.avatar\s+FROM/, 'SELECT COUNT(*) as total FROM');
    const total = safeFirst(await executeQuery(countQuery, params), { total: 0 }).total;

    query += ' ORDER BY p.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit, 10), parseInt(offset, 10));

    const posts = safeRows(await executeQuery(query, params));
    posts.forEach(r => {
      r.images = r.images ? (typeof r.images === 'string' ? JSON.parse(r.images) : r.images) : [];
      r.topics = r.topics ? (typeof r.topics === 'string' ? JSON.parse(r.topics) : r.topics) : [];
    });

    success(res, { posts, total });
  } catch (err) {
    serverError(res, err, '获取动态列表失败');
  }
}

/**
 * 获取动态详情
 * GET /api/admin/posts/:id
 */
async function getPostDetail(req, res) {
  try {
    const postId = parseInt(req.params.id, 10);
    if (isNaN(postId)) return error(res, 400, '动态ID无效');

    const result = await executeQuery(
      `SELECT p.*, u.nickname, u.avatar
       FROM posts p LEFT JOIN users u ON p.user_id = u.id WHERE p.id = ?`,
      [postId]
    );
    const post = safeFirst(result);
    if (!post.id) return error(res, 404, '动态不存在');

    post.images = post.images ? (typeof post.images === 'string' ? JSON.parse(post.images) : post.images) : [];
    post.topics = post.topics ? (typeof post.topics === 'string' ? JSON.parse(post.topics) : post.topics) : [];

    // 获取评论数
    const commentCount = safeFirst(
      await executeQuery('SELECT COUNT(*) as total FROM post_comments WHERE post_id = ?', [postId]),
      { total: 0 }
    ).total;

    // 获取点赞数
    const likeCount = safeFirst(
      await executeQuery('SELECT COUNT(*) as total FROM post_likes WHERE post_id = ?', [postId]),
      { total: 0 }
    ).total;

    post.comment_count_detail = commentCount;
    post.like_count_detail = likeCount;

    success(res, post);
  } catch (err) {
    serverError(res, err, '获取动态详情失败');
  }
}

/**
 * 切换动态状态（软删除/恢复）
 * PUT /api/admin/posts/:id/status
 * Body: { status: 0 | 1 }
 */
async function togglePostStatus(req, res) {
  try {
    const postId = parseInt(req.params.id, 10);
    if (isNaN(postId)) return error(res, 400, '动态ID无效');

    const { status: newStatus } = req.body;
    if (newStatus !== 0 && newStatus !== 1) {
      return error(res, 400, 'status 必须为 0（删除）或 1（恢复）');
    }

    const existing = safeFirst(await executeQuery('SELECT id FROM posts WHERE id = ?', [postId]));
    if (!existing.id) return error(res, 404, '动态不存在');

    await executeQuery('UPDATE posts SET status = ? WHERE id = ?', [newStatus, postId]);

    success(res, null, newStatus === 0 ? '动态已删除' : '动态已恢复');
  } catch (err) {
    serverError(res, err, '操作失败');
  }
}

module.exports = { getPostList, getPostDetail, togglePostStatus };
