/**
 * 管理员控制器
 * 运营后台数据看板、用户管理
 */

const { executeQuery, isDbAvailable } = require('../utils/database');
const { success, error, serverError } = require('../utils/response');

/**
 * 安全获取查询结果首行
 * pool.query() 返回 [rows, fields]，需解包第一维
 */
function safeFirst(result, defaultValue = {}) {
  if (!result) return defaultValue;
  // pool.query() 返回 [rows, fields]
  if (Array.isArray(result) && result.length === 2 && Array.isArray(result[0])) {
    result = result[0];
  }
  if (!Array.isArray(result) || result.length === 0) return defaultValue;
  return result[0] || defaultValue;
}

/**
 * 安全获取查询结果数组
 * pool.query() 返回 [rows, fields]，需解包第一维
 */
function safeRows(result) {
  if (!result) return [];
  // pool.query() 返回 [rows, fields]
  if (Array.isArray(result) && result.length === 2 && Array.isArray(result[0])) {
    return result[0];
  }
  if (!Array.isArray(result)) return [];
  return result;
}

/**
 * 数据看板 - 核心指标
 */
async function getDashboard(req, res) {
  try {
    // 检查数据库可用性
    if (!isDbAvailable()) {
      return error(res, 503, '数据库服务不可用，请稍后重试');
    }

    const stats = {};

    // 用户总数
    stats.total_users = safeFirst(await executeQuery('SELECT COUNT(*) as total FROM users'), { total: 0 }).total;

    // 今日新增
    stats.today_new_users = safeFirst(
      await executeQuery('SELECT COUNT(*) as total FROM users WHERE DATE(created_at) = CURDATE()'),
      { total: 0 }
    ).total;

    // 活跃用户（今日有操作）
    stats.today_active_users = safeFirst(
      await executeQuery('SELECT COUNT(DISTINCT user_id) as total FROM likes WHERE DATE(created_at) = CURDATE()'),
      { total: 0 }
    ).total;

    // 匹配总数
    stats.total_matches = safeFirst(
      await executeQuery('SELECT COUNT(*) as total FROM matches WHERE status = 1'),
      { total: 0 }
    ).total;

    // 今日匹配
    stats.today_matches = safeFirst(
      await executeQuery('SELECT COUNT(*) as total FROM matches WHERE DATE(created_at) = CURDATE()'),
      { total: 0 }
    ).total;

    // 消息总数
    stats.total_messages = safeFirst(
      await executeQuery('SELECT COUNT(*) as total FROM messages'),
      { total: 0 }
    ).total;

    // 今日消息
    stats.today_messages = safeFirst(
      await executeQuery('SELECT COUNT(*) as total FROM messages WHERE DATE(created_at) = CURDATE()'),
      { total: 0 }
    ).total;

    // 今日礼物统计
    const giftResult = safeFirst(
      await executeQuery(
        'SELECT COUNT(*) as total, COALESCE(SUM(total_price), 0) as total_value FROM gift_records WHERE DATE(created_at) = CURDATE()'
      ),
      { total: 0, total_value: 0 }
    );
    stats.today_gifts = giftResult.total;
    stats.today_gift_value = giftResult.total_value;

    // 总付费
    stats.total_revenue = safeFirst(
      await executeQuery('SELECT COALESCE(SUM(amount), 0) as total FROM orders WHERE status = 1'),
      { total: 0 }
    ).total;

    // 今日付费
    stats.today_revenue = safeFirst(
      await executeQuery('SELECT COALESCE(SUM(amount), 0) as total FROM orders WHERE status = 1 AND DATE(created_at) = CURDATE()'),
      { total: 0 }
    ).total;

    // 举报待处理
    stats.pending_reports = safeFirst(
      await executeQuery('SELECT COUNT(*) as total FROM reports WHERE status = 0'),
      { total: 0 }
    ).total;

    success(res, stats);
  } catch (err) {
    serverError(res, err, '获取数据看板失败');
  }
}

/**
 * 用户列表（管理员视图）
 */
async function getUserList(req, res) {
  try {
    const { limit = 20, offset = 0, status, keyword } = req.query;
    let query = 'SELECT * FROM users WHERE 1=1';
    const params = [];

    if (status !== undefined) {
      query += ' AND status = ?';
      params.push(parseInt(status, 10));
    }
    if (keyword) {
      query += ' AND (nickname LIKE ? OR phone LIKE ?)';
      params.push(`%${keyword}%`, `%${keyword}%`);
    }
    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit, 10), parseInt(offset, 10));

    const users = safeRows(await executeQuery(query, params));

    // 总数
    let countQuery = 'SELECT COUNT(*) as total FROM users WHERE 1=1';
    const countParams = [];
    if (status !== undefined) {
      countQuery += ' AND status = ?';
      countParams.push(parseInt(status, 10));
    }
    if (keyword) {
      countQuery += ' AND (nickname LIKE ? OR phone LIKE ?)';
      countParams.push(`%${keyword}%`, `%${keyword}%`);
    }
    const total = safeFirst(await executeQuery(countQuery, countParams), { total: 0 }).total;

    // 脱敏手机号
    users.forEach(u => {
      if (u.phone) u.phone = u.phone.slice(0, 3) + '****' + u.phone.slice(-4);
    });

    success(res, { users, total });
  } catch (err) {
    serverError(res, err, '获取用户列表失败');
  }
}

/**
 * 封禁/解封用户
 */
async function toggleUserStatus(req, res) {
  try {
    const userId = parseInt(req.params.id, 10);
    if (isNaN(userId) || userId <= 0) {
      return error(res, 400, '用户ID无效');
    }

    const { action } = req.body;

    if (action === 'ban') {
      await executeQuery('UPDATE users SET status = 0 WHERE id = ?', [userId]);
      return success(res, null, '用户已封禁');
    } else if (action === 'unban') {
      await executeQuery('UPDATE users SET status = 1 WHERE id = ?', [userId]);
      return success(res, null, '用户已解封');
    }

    return error(res, 400, '无效操作，请使用 ban 或 unban');
  } catch (err) {
    serverError(res, err, '操作失败');
  }
}

/**
 * 增强数据看板 - 含动态/评论/营收/礼物维度
 */
async function getDashboardEnhanced(req, res) {
  try {
    if (!isDbAvailable()) {
      return error(res, 503, '数据库服务不可用，请稍后重试');
    }

    const stats = {};

    // 用户统计
    stats.total_users = safeFirst(await executeQuery('SELECT COUNT(*) as total FROM users'), { total: 0 }).total;
    stats.today_new_users = safeFirst(
      await executeQuery('SELECT COUNT(*) as total FROM users WHERE DATE(created_at) = CURDATE()'),
      { total: 0 }
    ).total;
    stats.today_active_users = safeFirst(
      await executeQuery('SELECT COUNT(DISTINCT user_id) as total FROM likes WHERE DATE(created_at) = CURDATE()'),
      { total: 0 }
    ).total;

    // 动态统计
    stats.total_posts = safeFirst(await executeQuery('SELECT COUNT(*) as total FROM posts'), { total: 0 }).total;
    stats.today_posts = safeFirst(
      await executeQuery('SELECT COUNT(*) as total FROM posts WHERE DATE(created_at) = CURDATE()'),
      { total: 0 }
    ).total;
    stats.deleted_posts = safeFirst(
      await executeQuery('SELECT COUNT(*) as total FROM posts WHERE status = 0'),
      { total: 0 }
    ).total;

    // 评论统计
    stats.total_comments = safeFirst(
      await executeQuery('SELECT COUNT(*) as total FROM post_comments'), { total: 0 }
    ).total;
    stats.today_comments = safeFirst(
      await executeQuery('SELECT COUNT(*) as total FROM post_comments WHERE DATE(created_at) = CURDATE()'),
      { total: 0 }
    ).total;

    // 匹配统计
    stats.total_matches = safeFirst(
      await executeQuery('SELECT COUNT(*) as total FROM matches WHERE status = 1'), { total: 0 }
    ).total;
    stats.today_matches = safeFirst(
      await executeQuery('SELECT COUNT(*) as total FROM matches WHERE DATE(created_at) = CURDATE()'),
      { total: 0 }
    ).total;

    // 消息统计
    stats.total_messages = safeFirst(await executeQuery('SELECT COUNT(*) as total FROM messages'), { total: 0 }).total;
    stats.today_messages = safeFirst(
      await executeQuery('SELECT COUNT(*) as total FROM messages WHERE DATE(created_at) = CURDATE()'),
      { total: 0 }
    ).total;

    // 营收统计
    stats.total_revenue = safeFirst(
      await executeQuery('SELECT COALESCE(SUM(amount), 0) as total FROM orders WHERE status = 1'), { total: 0 }
    ).total;
    stats.today_revenue = safeFirst(
      await executeQuery('SELECT COALESCE(SUM(amount), 0) as total FROM orders WHERE status = 1 AND DATE(created_at) = CURDATE()'),
      { total: 0 }
    ).total;

    // 本周营收
    stats.week_revenue = safeFirst(
      await executeQuery('SELECT COALESCE(SUM(amount), 0) as total FROM orders WHERE status = 1 AND YEARWEEK(created_at, 1) = YEARWEEK(CURDATE(), 1)'),
      { total: 0 }
    ).total;

    // 本月营收
    stats.month_revenue = safeFirst(
      await executeQuery('SELECT COALESCE(SUM(amount), 0) as total FROM orders WHERE status = 1 AND DATE_FORMAT(created_at, "%Y-%m") = DATE_FORMAT(CURDATE(), "%Y-%m")'),
      { total: 0 }
    ).total;

    // 礼物统计
    const giftStats = safeFirst(
      await executeQuery('SELECT COUNT(*) as total, COALESCE(SUM(total_price), 0) as total_value FROM gift_records WHERE DATE(created_at) = CURDATE()'),
      { total: 0, total_value: 0 }
    );
    stats.today_gifts = giftStats.total;
    stats.today_gift_value = giftStats.total_value;

    stats.total_gift_value = safeFirst(
      await executeQuery('SELECT COALESCE(SUM(total_price), 0) as total FROM gift_records'), { total: 0 }
    ).total;

    // 举报统计
    stats.pending_reports = safeFirst(
      await executeQuery('SELECT COUNT(*) as total FROM reports WHERE status = 0'), { total: 0 }
    ).total;
    stats.total_reports = safeFirst(await executeQuery('SELECT COUNT(*) as total FROM reports'), { total: 0 }).total;
    stats.handled_reports = safeFirst(
      await executeQuery('SELECT COUNT(*) as total FROM reports WHERE status = 1'), { total: 0 }
    ).total;

    // 在线用户数（最近5分钟活跃）
    stats.online_users = safeFirst(
      await executeQuery("SELECT COUNT(DISTINCT user_id) as total FROM likes WHERE created_at >= DATE_SUB(NOW(), INTERVAL 5 MINUTE)"),
      { total: 0 }
    ).total;

    success(res, stats);
  } catch (err) {
    serverError(res, err, '获取增强数据看板失败');
  }
}

/**
 * 获取礼物记录列表（管理员视图）
 * GET /api/admin/gift-records?limit=20&offset=0&sender_id=&receiver_id=&start_date=&end_date=
 */
async function getGiftRecords(req, res) {
  try {
    const { limit = 20, offset = 0, sender_id, receiver_id, start_date, end_date } = req.query;

    let query = `SELECT gr.*, g.name as gift_name, g.image as gift_image,
      s.nickname as sender_nickname, s.avatar as sender_avatar,
      r.nickname as receiver_nickname, r.avatar as receiver_avatar
      FROM gift_records gr
      LEFT JOIN gifts g ON gr.gift_id = g.id
      LEFT JOIN users s ON gr.sender_id = s.id
      LEFT JOIN users r ON gr.receiver_id = r.id
      WHERE 1=1`;
    const params = [];

    if (sender_id) { query += ' AND gr.sender_id = ?'; params.push(parseInt(sender_id, 10)); }
    if (receiver_id) { query += ' AND gr.receiver_id = ?'; params.push(parseInt(receiver_id, 10)); }
    if (start_date) { query += ' AND gr.created_at >= ?'; params.push(start_date); }
    if (end_date) { query += ' AND gr.created_at < DATE_ADD(?, INTERVAL 1 DAY)'; params.push(end_date); }

    // 总数
    const countQuery = query
      .replace(/SELECT gr\.\*, g\.name.*?FROM/, 'SELECT COUNT(*) as total FROM');
    const total = safeFirst(await executeQuery(countQuery, params), { total: 0 }).total;

    // 汇总
    const sumQuery = query
      .replace(/SELECT gr\.\*, g\.name.*?FROM/, 'SELECT COALESCE(SUM(gr.total_price), 0) as total_value, COUNT(*) as total_count FROM');
    const summary = safeFirst(await executeQuery(sumQuery, params), { total_value: 0, total_count: 0 });

    query += ' ORDER BY gr.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit, 10), parseInt(offset, 10));

    const records = safeRows(await executeQuery(query, params));

    success(res, { records, total, summary });
  } catch (err) {
    serverError(res, err, '获取礼物记录失败');
  }
}

/**
 * 获取金币交易流水（管理员视图）
 * GET /api/admin/transactions?limit=20&offset=0&user_id=&type=&start_date=&end_date=
 */
async function getTransactionLogs(req, res) {
  try {
    const { limit = 20, offset = 0, user_id, type, start_date, end_date } = req.query;

    let query = `SELECT ct.*, u.nickname, u.phone
      FROM coin_transactions ct
      LEFT JOIN users u ON ct.user_id = u.id
      WHERE 1=1`;
    const params = [];

    if (user_id) { query += ' AND ct.user_id = ?'; params.push(parseInt(user_id, 10)); }
    if (type) { query += ' AND ct.type = ?'; params.push(type); }
    if (start_date) { query += ' AND ct.created_at >= ?'; params.push(start_date); }
    if (end_date) { query += ' AND ct.created_at < DATE_ADD(?, INTERVAL 1 DAY)'; params.push(end_date); }

    // 总数
    const countQuery = query
      .replace(/SELECT ct\.\*, u\.nickname, u\.phone\s+FROM/, 'SELECT COUNT(*) as total FROM');
    const total = safeFirst(await executeQuery(countQuery, params), { total: 0 }).total;

    query += ' ORDER BY ct.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit, 10), parseInt(offset, 10));

    const transactions = safeRows(await executeQuery(query, params));

    // 脱敏手机号
    transactions.forEach(t => {
      if (t.phone) t.phone = t.phone.slice(0, 3) + '****' + t.phone.slice(-4);
    });

    success(res, { transactions, total });
  } catch (err) {
    serverError(res, err, '获取交易流水失败');
  }
}

module.exports = {
  getDashboard,
  getUserList,
  toggleUserStatus,
  getDashboardEnhanced,
  getGiftRecords,
  getTransactionLogs
};
