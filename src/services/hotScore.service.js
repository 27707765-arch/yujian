/**
 * 热度分数服务
 * 公式: score = (likes*3 + comments*2) / (hours_since_post + 2)^1.5
 */
const { executeQuery, isDbAvailable } = require('../utils/database');

function calculateScore(post) {
  const likes = post.like_count || 0;
  const comments = post.comment_count || 0;
  const hoursSincePost = post.created_at
    ? Math.max(0, (Date.now() - new Date(post.created_at).getTime()) / 3600000)
    : 0;
  const numerator = likes * 3 + comments * 2;
  const denominator = Math.pow(hoursSincePost + 2, 1.5);
  return numerator / denominator;
}

async function updatePostScore(postId) {
  try {
    if (!isDbAvailable()) return;
    const [rows] = await executeQuery(
      'SELECT id, like_count, comment_count, created_at FROM posts WHERE id = ?', [postId]
    );
    if (!rows[0]) return;
    const score = calculateScore(rows[0]);
    await executeQuery('UPDATE posts SET hot_score = ? WHERE id = ?', [score, postId]);
  } catch (e) { /* 静默 */ }
}

module.exports = { calculateScore, updatePostScore };
