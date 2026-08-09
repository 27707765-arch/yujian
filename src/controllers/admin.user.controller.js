/**
 * 用户详情管理控制器
 * 查看用户全部信息（资料/相册/统计/动态/消息/钱包/认证/行为）+ 强制操作
 */
const { executeQuery } = require('../utils/database');
const { success, error, serverError } = require('../utils/response');
const bcrypt = require('bcryptjs');
const UserVerification = require('../models/UserVerification');
const Post = require('../models/Post');
const Wallet = require('../models/Wallet');
const { normalizeUploadUrl, parseImagesField } = require('../utils/upload');

// 安全解包工具：executeQuery 返回 [rows, fields]，DB 降级时返回 [[], []]
function safeRows(result) {
  if (!result) return [];
  if (Array.isArray(result) && Array.isArray(result[0])) return result[0] || [];
  if (Array.isArray(result)) return result;
  return [];
}

function safeFirst(result, defaultValue = {}) {
  const rows = safeRows(result);
  return rows[0] || defaultValue;
}

// ============================================================
// 行为聚合纯函数（可单测）
// ============================================================

// 行为类型 → 中文标签（前端展示用）
const BEHAVIOR_TYPE_LABELS = {
  view_profile: '查看主页',
  like_user: '喜欢用户',
  like_post: '点赞动态',
  comment_post: '评论动态',
  message_send: '发送消息',
  message_recv: '收到消息',
  match: '匹配成功',
  slide: '滑动操作',
  gift_send: '送出礼物',
  gift_recv: '收到礼物'
};

// 滑动操作 action 中文映射
const SLIDE_ACTION_LABELS = { like: '喜欢', skip: '跳过', super_like: '超级喜欢' };

/**
 * 将一条行为原始行归一为统一结构
 * @param {Object} row - 各表原始行（已含 peer 昵称/头像字段或可推断）
 * @param {string} dim - 维度标识（view/like/post_like/comment/message/match/behavior/gift）
 * @param {string} direction - 'sent' | 'received'
 * @returns {Object|null} 归一化行为记录
 */
function normalizeBehaviorRow(row, dim, direction) {
  if (!row) return null;
  const peerId = row.peer_id !== undefined ? row.peer_id
    : (row.target_user_id !== undefined ? row.target_user_id
      : (row.sender_id !== undefined ? row.sender_id : row.user_id));
  return {
    dim,
    direction,
    peer: {
      id: peerId,
      nickname: row.peer_nickname || '',
      avatar: row.peer_avatar || null
    },
    created_at: row.created_at,
    action: row.action || null,
    message_preview: row.message_preview || null,
    post: row.post ? { id: row.post.id, content: row.post.content } : null,
    comment_content: row.comment_content || null,
    gift_name: row.gift_name || null,
    amount: row.amount !== undefined ? row.amount : null
  };
}

/**
 * 合并并按时间倒序排序行为列表
 * @param {Array} lists - 多个行为数组
 * @param {number} limit - 截断上限
 * @returns {Array}
 */
function mergeAndSortBehaviors(lists, limit = 100) {
  const merged = lists.filter(Boolean).flat().filter(Boolean);
  merged.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  return merged.slice(0, limit);
}

/**
 * 获取用户行为多维聚合
 * GET /api/admin/users/:id/behaviors/all
 * 聚合源：查看(user_views)/喜欢(likes)/点赞动态(post_likes)/评论(post_comments)/消息(messages)/匹配(matches)/滑动(user_behaviors)
 * 返回 { total_sent, total_received, sent:[], received:[] }
 */
async function getUserBehaviorsAll(req, res) {
  try {
    const uid = parseInt(req.params.id);
    if (isNaN(uid) || uid <= 0) return error(res, 400, '用户ID无效');

    const LIMIT = 100;
    const sent = [];
    const received = [];

    // 1. 查看主页（user_views）
    let rows = safeRows(await executeQuery(
      `SELECT uv.target_user_id AS peer_id, uv.created_at, peer.nickname AS peer_nickname, peer.avatar AS peer_avatar
       FROM user_views uv LEFT JOIN users peer ON peer.id = uv.target_user_id
       WHERE uv.user_id = ? ORDER BY uv.created_at DESC LIMIT ?`, [uid, LIMIT]
    ));
    rows.forEach(r => sent.push(normalizeBehaviorRow({ ...r, action: null }, 'view', 'sent')));

    rows = safeRows(await executeQuery(
      `SELECT uv.user_id AS peer_id, uv.created_at, peer.nickname AS peer_nickname, peer.avatar AS peer_avatar
       FROM user_views uv LEFT JOIN users peer ON peer.id = uv.user_id
       WHERE uv.target_user_id = ? ORDER BY uv.created_at DESC LIMIT ?`, [uid, LIMIT]
    ));
    rows.forEach(r => received.push(normalizeBehaviorRow({ ...r, action: null }, 'view', 'received')));

    // 2. 喜欢用户（likes）
    rows = safeRows(await executeQuery(
      `SELECT l.target_user_id AS peer_id, l.created_at, peer.nickname AS peer_nickname, peer.avatar AS peer_avatar
       FROM likes l LEFT JOIN users peer ON peer.id = l.target_user_id
       WHERE l.user_id = ? ORDER BY l.created_at DESC LIMIT ?`, [uid, LIMIT]
    ));
    rows.forEach(r => sent.push(normalizeBehaviorRow({ ...r, action: null }, 'like', 'sent')));

    rows = safeRows(await executeQuery(
      `SELECT l.user_id AS peer_id, l.created_at, peer.nickname AS peer_nickname, peer.avatar AS peer_avatar
       FROM likes l LEFT JOIN users peer ON peer.id = l.user_id
       WHERE l.target_user_id = ? ORDER BY l.created_at DESC LIMIT ?`, [uid, LIMIT]
    ));
    rows.forEach(r => received.push(normalizeBehaviorRow({ ...r, action: null }, 'like', 'received')));

    // 3. 点赞动态（post_likes JOIN posts 反查被点赞人，排除自己赞自己）
    rows = safeRows(await executeQuery(
      `SELECT p.user_id AS peer_id, pl.created_at, peer.nickname AS peer_nickname, peer.avatar AS peer_avatar,
              pl.post_id, LEFT(p.content, 40) AS post_content
       FROM post_likes pl
       JOIN posts p ON p.id = pl.post_id AND p.user_id <> ?
       LEFT JOIN users peer ON peer.id = p.user_id
       WHERE pl.user_id = ? ORDER BY pl.created_at DESC LIMIT ?`, [uid, uid, LIMIT]
    ));
    rows.forEach(r => sent.push(normalizeBehaviorRow({
      ...r, action: null,
      post: r.post_id ? { id: r.post_id, content: r.post_content } : null
    }, 'post_like', 'sent')));

    rows = safeRows(await executeQuery(
      `SELECT pl.user_id AS peer_id, pl.created_at, peer.nickname AS peer_nickname, peer.avatar AS peer_avatar,
              pl.post_id, LEFT(p.content, 40) AS post_content
       FROM post_likes pl
       JOIN posts p ON p.id = pl.post_id AND p.user_id = ?
       LEFT JOIN users peer ON peer.id = pl.user_id
       WHERE pl.user_id <> ? ORDER BY pl.created_at DESC LIMIT ?`, [uid, uid, LIMIT]
    ));
    rows.forEach(r => received.push(normalizeBehaviorRow({
      ...r, action: null,
      post: r.post_id ? { id: r.post_id, content: r.post_content } : null
    }, 'post_like', 'received')));

    // 4. 评论动态（post_comments JOIN posts 反查被评论人）
    rows = safeRows(await executeQuery(
      `SELECT p.user_id AS peer_id, pc.created_at, peer.nickname AS peer_nickname, peer.avatar AS peer_avatar,
              pc.content AS comment_content, pc.post_id, LEFT(p.content, 40) AS post_content
       FROM post_comments pc
       JOIN posts p ON p.id = pc.post_id AND p.user_id <> ?
       LEFT JOIN users peer ON peer.id = p.user_id
       WHERE pc.user_id = ? ORDER BY pc.created_at DESC LIMIT ?`, [uid, uid, LIMIT]
    ));
    rows.forEach(r => sent.push(normalizeBehaviorRow({
      ...r, action: null,
      post: r.post_id ? { id: r.post_id, content: r.post_content } : null
    }, 'comment', 'sent')));

    rows = safeRows(await executeQuery(
      `SELECT pc.user_id AS peer_id, pc.created_at, peer.nickname AS peer_nickname, peer.avatar AS peer_avatar,
              pc.content AS comment_content, pc.post_id, LEFT(p.content, 40) AS post_content
       FROM post_comments pc
       JOIN posts p ON p.id = pc.post_id AND p.user_id = ?
       LEFT JOIN users peer ON peer.id = pc.user_id
       WHERE pc.user_id <> ? ORDER BY pc.created_at DESC LIMIT ?`, [uid, uid, LIMIT]
    ));
    rows.forEach(r => received.push(normalizeBehaviorRow({
      ...r, action: null,
      post: r.post_id ? { id: r.post_id, content: r.post_content } : null
    }, 'comment', 'received')));

    // 5. 消息（messages）
    rows = safeRows(await executeQuery(
      `SELECT m.receiver_id AS peer_id, m.created_at, peer.nickname AS peer_nickname, peer.avatar AS peer_avatar,
              LEFT(m.content, 40) AS message_preview
       FROM messages m LEFT JOIN users peer ON peer.id = m.receiver_id
       WHERE m.sender_id = ? ORDER BY m.created_at DESC LIMIT ?`, [uid, LIMIT]
    ));
    rows.forEach(r => sent.push(normalizeBehaviorRow({ ...r, action: null }, 'message', 'sent')));

    rows = safeRows(await executeQuery(
      `SELECT m.sender_id AS peer_id, m.created_at, peer.nickname AS peer_nickname, peer.avatar AS peer_avatar,
              LEFT(m.content, 40) AS message_preview
       FROM messages m LEFT JOIN users peer ON peer.id = m.sender_id
       WHERE m.receiver_id = ? ORDER BY m.created_at DESC LIMIT ?`, [uid, LIMIT]
    ));
    rows.forEach(r => received.push(normalizeBehaviorRow({ ...r, action: null }, 'message', 'received')));

    // 6. 匹配（matches，统一记 sent，避免 received 重复）
    rows = safeRows(await executeQuery(
      `SELECT IF(m.user1_id = ?, m.user2_id, m.user1_id) AS peer_id, m.created_at, peer.nickname AS peer_nickname, peer.avatar AS peer_avatar
       FROM matches m LEFT JOIN users peer ON peer.id = IF(m.user1_id = ?, m.user2_id, m.user1_id)
       WHERE (m.user1_id = ? OR m.user2_id = ?) AND m.status = 1
       ORDER BY m.created_at DESC LIMIT ?`, [uid, uid, uid, uid, LIMIT]
    ));
    rows.forEach(r => sent.push(normalizeBehaviorRow({ ...r, action: null }, 'match', 'sent')));

    // 7. 滑动操作（user_behaviors）
    rows = safeRows(await executeQuery(
      `SELECT ub.target_user_id AS peer_id, ub.created_at, ub.action, peer.nickname AS peer_nickname, peer.avatar AS peer_avatar
       FROM user_behaviors ub LEFT JOIN users peer ON peer.id = ub.target_user_id
       WHERE ub.user_id = ? AND ub.action IN ('like','skip','super_like')
       ORDER BY ub.created_at DESC LIMIT ?`, [uid, LIMIT]
    ));
    rows.forEach(r => sent.push(normalizeBehaviorRow({ ...r }, 'behavior', 'sent')));

    // 合并排序截断
    const mergedSent = mergeAndSortBehaviors(sent, LIMIT);
    const mergedReceived = mergeAndSortBehaviors(received, LIMIT);

    success(res, {
      total_sent: mergedSent.length,
      total_received: mergedReceived.length,
      sent: mergedSent,
      received: mergedReceived,
      labels: BEHAVIOR_TYPE_LABELS,
      slide_labels: SLIDE_ACTION_LABELS
    });
  } catch (err) { serverError(res, err, '获取用户行为聚合失败'); }
}

/**
 * 获取用户详情
 * GET /api/admin/users/:id
 * 返回完整资料 + 相册 + 认证状态 + 统计 + 管理员备注
 */
async function getUserDetail(req, res) {
  try {
    const uid = parseInt(req.params.id);
    if (isNaN(uid) || uid <= 0) return error(res, 400, '用户ID无效');
    const user = safeFirst(await executeQuery('SELECT * FROM users WHERE id = ?', [uid]));
    if (!user.id) return error(res, 404, '用户不存在');

    // 头像归一（历史裸路径 /xxx → /uploads/xxx）
    if (user.avatar) user.avatar = normalizeUploadUrl(user.avatar);

    // 相册（URL 归一）
    const photos = safeRows(await executeQuery('SELECT * FROM user_photos WHERE user_id = ? AND status = 1 ORDER BY sort_order ASC, id ASC', [uid]));
    photos.forEach(p => { if (p.url) p.url = normalizeUploadUrl(p.url); });

    // 统计
    const likeCount = safeFirst(await executeQuery('SELECT COUNT(*) as total FROM likes WHERE user_id = ?', [uid]), { total: 0 }).total;
    const likeReceivedCount = safeFirst(await executeQuery('SELECT COUNT(*) as total FROM likes WHERE target_user_id = ?', [uid]), { total: 0 }).total;
    const viewSentCount = safeFirst(await executeQuery('SELECT COUNT(*) as total FROM user_views WHERE user_id = ?', [uid]), { total: 0 }).total;
    const matchCount = safeFirst(await executeQuery('SELECT COUNT(*) as total FROM matches WHERE user1_id = ? OR user2_id = ?', [uid, uid]), { total: 0 }).total;
    const msgCount = safeFirst(await executeQuery('SELECT COUNT(*) as total FROM messages WHERE sender_id = ? OR receiver_id = ?', [uid, uid]), { total: 0 }).total;
    const postCount = safeFirst(await executeQuery('SELECT COUNT(*) as total FROM posts WHERE user_id = ?', [uid]), { total: 0 }).total;
    const viewCount = safeFirst(await executeQuery('SELECT COUNT(*) as total FROM user_views WHERE target_user_id = ?', [uid]), { total: 0 }).total;
    const behaviorCount = safeFirst(await executeQuery('SELECT COUNT(*) as total FROM user_behaviors WHERE user_id = ?', [uid]), { total: 0 }).total;
    const giftReceivedCount = safeFirst(await executeQuery('SELECT COUNT(*) as total FROM gift_records WHERE receiver_id = ?', [uid]), { total: 0 }).total;
    const matchToday = safeFirst(await executeQuery('SELECT COUNT(*) as total FROM matches WHERE (user1_id = ? OR user2_id = ?) AND DATE(created_at) = CURDATE()', [uid, uid]), { total: 0 }).total;

    // 备注
    const note = safeFirst(await executeQuery('SELECT * FROM user_admin_notes WHERE user_id = ?', [uid]));

    success(res, {
      user,
      photos,
      stats: { likeCount, likeReceivedCount, viewSentCount, matchCount, msgCount, postCount, viewCount, behaviorCount, giftReceivedCount, matchToday },
      adminNote: note || null
    });
  } catch (err) { serverError(res, err, '获取用户详情失败'); }
}

/**
 * 获取用户钱包（含提现记录 + 中文类型标签）
 * GET /api/admin/users/:id/wallet
 */
const TX_TYPE_LABELS = { recharge: '充值', gift_send: '赠送礼物', gift_receive: '收到礼物', refund: '退款', task_reward: '任务奖励', checkin: '签到', withdraw: '提现', super_like: '超级喜欢' };
const WITHDRAW_STATUS_LABELS = { 0: '处理中', 1: '已提现', 2: '已驳回' };

async function getUserWallet(req, res) {
  try {
    const uid = parseInt(req.params.id);
    const wallet = safeFirst(await executeQuery('SELECT * FROM wallets WHERE user_id = ?', [uid]));
    const txs = safeRows(await executeQuery('SELECT * FROM coin_transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 50', [uid]));
    const withdraws = await Wallet.getWithdraws(uid, 20, 0);
    // 中文标签映射
    const transactions = txs.map(t => ({ ...t, type_label: TX_TYPE_LABELS[t.type] || t.type }));
    const withdrawList = (withdraws || []).map(w => ({ ...w, status_label: WITHDRAW_STATUS_LABELS[w.status] !== undefined ? WITHDRAW_STATUS_LABELS[w.status] : '未知' }));
    success(res, { wallet: wallet.id ? wallet : null, transactions, withdraws: withdrawList });
  } catch (err) { serverError(res, err, '获取钱包失败'); }
}

/**
 * 获取用户动态列表（含点赞用户 + 评论 + 真实计数）
 * GET /api/admin/users/:id/posts
 */
async function getUserPosts(req, res) {
  try {
    const uid = parseInt(req.params.id);
    const posts = safeRows(await executeQuery(
      'SELECT p.*, u.nickname, u.avatar FROM posts p LEFT JOIN users u ON p.user_id = u.id WHERE p.user_id = ? ORDER BY p.created_at DESC LIMIT 30',
      [uid]
    ));
    posts.forEach(p => {
      p.images = parseImagesField(p.images);
      p.topics = p.topics ? (typeof p.topics === 'string' ? JSON.parse(p.topics) : p.topics) : [];
      if (p.video_url) p.video_url = normalizeUploadUrl(p.video_url);
      if (p.video_cover) p.video_cover = normalizeUploadUrl(p.video_cover);
    });

    // 批量查点赞用户（一次 IN 查询，避免 N+1）
    const postIds = posts.filter(p => p.id).map(p => p.id);
    const likesMap = {}; // post_id -> [{user_id,nickname,avatar,created_at}]
    if (postIds.length > 0) {
      const placeholders = postIds.map(() => '?').join(',');
      const likeRows = safeRows(await executeQuery(
        `SELECT pl.post_id, pl.user_id, pl.created_at, u.nickname, u.avatar
         FROM post_likes pl LEFT JOIN users u ON pl.user_id = u.id
         WHERE pl.post_id IN (${placeholders})
         ORDER BY pl.created_at DESC`,
        postIds
      ));
      likeRows.forEach(l => {
        if (!likesMap[l.post_id]) likesMap[l.post_id] = [];
        if (likesMap[l.post_id].length < 20) likesMap[l.post_id].push({ user_id: l.user_id, nickname: l.nickname, avatar: l.avatar ? normalizeUploadUrl(l.avatar) : null, created_at: l.created_at });
      });
    }

    // 逐篇取评论（复用 Post.getComments 含嵌套 replies）+ 真实计数
    for (const p of posts) {
      p.likes = likesMap[p.id] || [];
      try { p.comments = await Post.getComments(p.id, 50, 0); } catch (e) { p.comments = []; }
      p.like_count_detail = safeFirst(await executeQuery('SELECT COUNT(*) as total FROM post_likes WHERE post_id = ?', [p.id]), { total: 0 }).total;
      p.comment_count_detail = safeFirst(await executeQuery('SELECT COUNT(*) as total FROM post_comments WHERE post_id = ?', [p.id]), { total: 0 }).total;
    }

    success(res, posts);
  } catch (err) { serverError(res, err, '获取用户动态失败'); }
}

/**
 * 获取用户消息记录（含 peer_id 供前端按对端分组）
 * GET /api/admin/users/:id/messages
 * sender_id=? OR receiver_id=?（含发送与接收），返回 direction 标记
 */
async function getUserMessages(req, res) {
  try {
    const uid = parseInt(req.params.id);
    const rows = safeRows(await executeQuery(
      `SELECT m.*, peer.nickname as peer_nickname, peer.avatar as peer_avatar,
              IF(m.sender_id = ?, m.receiver_id, m.sender_id) AS peer_id
       FROM messages m
       LEFT JOIN users peer ON peer.id = IF(m.sender_id = ?, m.receiver_id, m.sender_id)
       WHERE m.sender_id = ? OR m.receiver_id = ?
       ORDER BY m.created_at DESC LIMIT 100`,
      [uid, uid, uid, uid]
    ));
    const messages = rows.map(m => ({
      ...m,
      direction: m.sender_id === uid ? 'sent' : 'received'
    }));
    success(res, messages);
  } catch (err) { serverError(res, err, '获取用户消息失败'); }
}

/**
 * 获取用户认证记录
 * GET /api/admin/users/:id/verifications
 * 复用 UserVerification.findByUserId（DB优先 + 内存降级）
 */
async function getUserVerifications(req, res) {
  try {
    const uid = parseInt(req.params.id);
    const records = await UserVerification.findByUserId(uid);
    success(res, records || []);
  } catch (err) { serverError(res, err, '获取用户认证记录失败'); }
}

/**
 * 获取用户滑动行为记录
 * GET /api/admin/users/:id/behaviors
 */
async function getUserBehaviors(req, res) {
  try {
    const uid = parseInt(req.params.id);
    const behaviors = safeRows(await executeQuery(
      'SELECT * FROM user_behaviors WHERE user_id = ? ORDER BY created_at DESC LIMIT 100',
      [uid]
    ));
    success(res, behaviors);
  } catch (err) { serverError(res, err, '获取用户行为失败'); }
}

/**
 * 强制修改用户资料
 * PUT /api/admin/users/:id/profile
 */
async function updateUserProfile(req, res) {
  try {
    const uid = parseInt(req.params.id);
    const { nickname, bio, gender, age, status } = req.body;
    const updates = [];
    const vals = [];
    if (nickname !== undefined) { updates.push('nickname = ?'); vals.push(nickname); }
    if (bio !== undefined) { updates.push('bio = ?'); vals.push(bio); }
    if (gender !== undefined) { updates.push('gender = ?'); vals.push(gender); }
    if (age !== undefined) { updates.push('age = ?'); vals.push(age); }
    if (status !== undefined) { updates.push('status = ?'); vals.push(status); }
    if (updates.length === 0) return error(res, 400, '没有需要更新的字段');
    vals.push(uid);
    await executeQuery(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, vals);
    success(res, null, '更新成功');
  } catch (err) { serverError(res, err, '更新用户资料失败'); }
}

/**
 * 重置用户密码
 * POST /api/admin/users/:id/reset-password
 */
async function resetUserPassword(req, res) {
  try {
    const uid = parseInt(req.params.id);
    const newPass = Math.random().toString(36).slice(-8);
    const hash = await bcrypt.hash(newPass, 10);
    await executeQuery('UPDATE users SET password_hash = ? WHERE id = ?', [hash, uid]);
    success(res, { newPassword: newPass }, '密码已重置');
  } catch (err) { serverError(res, err, '重置密码失败'); }
}

/**
 * 更新管理员备注
 * PUT /api/admin/users/:id/note
 */
async function updateUserNote(req, res) {
  try {
    const uid = parseInt(req.params.id);
    const { note } = req.body;
    await executeQuery('INSERT INTO user_admin_notes (user_id, note, updated_by) VALUES (?,?,?) ON DUPLICATE KEY UPDATE note = VALUES(note), updated_by = VALUES(updated_by)', [uid, note, req.user.id]);
    success(res, null, '备注已更新');
  } catch (err) { serverError(res, err, '更新备注失败'); }
}

module.exports = {
  getUserDetail,
  getUserWallet,
  getUserPosts,
  getUserMessages,
  getUserVerifications,
  getUserBehaviors,
  getUserBehaviorsAll,
  updateUserProfile,
  resetUserPassword,
  updateUserNote,
  // 纯函数导出（供单测）
  normalizeBehaviorRow,
  mergeAndSortBehaviors,
  BEHAVIOR_TYPE_LABELS,
  SLIDE_ACTION_LABELS
};
