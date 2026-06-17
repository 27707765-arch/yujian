/**
 * 管理员控制器
 * 运营后台数据看板、用户管理
 */

const { pool } = require('../config/database');
const { success, error, serverError } = require('../utils/response');

/**
 * 数据看板 - 核心指标
 */
async function getDashboard(req, res) {
  try {
    const stats = {};

    // 用户总数
    const [userCount] = await pool.execute('SELECT COUNT(*) as total FROM users');
    stats.total_users = userCount[0].total;

    // 今日新增
    const [todayUsers] = await pool.execute(
      'SELECT COUNT(*) as total FROM users WHERE DATE(created_at) = CURDATE()'
    );
    stats.today_new_users = todayUsers[0].total;

    // 活跃用户（今日有操作）
    const [activeUsers] = await pool.execute(
      'SELECT COUNT(DISTINCT user_id) as total FROM likes WHERE DATE(created_at) = CURDATE()'
    );
    stats.today_active_users = activeUsers[0].total;

    // 匹配数
    const [matchCount] = await pool.execute('SELECT COUNT(*) as total FROM matches WHERE status = 1');
    stats.total_matches = matchCount[0].total;

    // 今日匹配
    const [todayMatches] = await pool.execute(
      'SELECT COUNT(*) as total FROM matches WHERE DATE(created_at) = CURDATE()'
    );
    stats.today_matches = todayMatches[0].total;

    // 消息数
    const [msgCount] = await pool.execute('SELECT COUNT(*) as total FROM messages');
    stats.total_messages = msgCount[0].total;

    // 今日消息
    const [todayMsgs] = await pool.execute(
      'SELECT COUNT(*) as total FROM messages WHERE DATE(created_at) = CURDATE()'
    );
    stats.today_messages = todayMsgs[0].total;

    // 礼物统计
    const [giftStats] = await pool.execute(
      'SELECT COUNT(*) as total, COALESCE(SUM(total_price), 0) as total_value FROM gift_records WHERE DATE(created_at) = CURDATE()'
    );
    stats.today_gifts = giftStats[0].total;
    stats.today_gift_value = giftStats[0].total_value;

    // 付费统计
    const [revenue] = await pool.execute(
      'SELECT COALESCE(SUM(amount), 0) as total FROM orders WHERE status = 1'
    );
    stats.total_revenue = revenue[0].total;

    const [todayRevenue] = await pool.execute(
      'SELECT COALESCE(SUM(amount), 0) as total FROM orders WHERE status = 1 AND DATE(created_at) = CURDATE()'
    );
    stats.today_revenue = todayRevenue[0].total;

    // 举报待处理
    const [pendingReports] = await pool.execute(
      'SELECT COUNT(*) as total FROM reports WHERE status = 0'
    );
    stats.pending_reports = pendingReports[0].total;

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
      params.push(parseInt(status));
    }
    if (keyword) {
      query += ' AND (nickname LIKE ? OR phone LIKE ?)';
      params.push(`%${keyword}%`, `%${keyword}%`);
    }
    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const [users] = await pool.execute(query, params);

    // 总数
    let countQuery = 'SELECT COUNT(*) as total FROM users WHERE 1=1';
    const countParams = [];
    if (status !== undefined) {
      countQuery += ' AND status = ?';
      countParams.push(parseInt(status));
    }
    if (keyword) {
      countQuery += ' AND (nickname LIKE ? OR phone LIKE ?)';
      countParams.push(`%${keyword}%`, `%${keyword}%`);
    }
    const [countResult] = await pool.execute(countQuery, countParams);

    // 脱敏手机号
    users.forEach(u => {
      if (u.phone) u.phone = u.phone.slice(0, 3) + '****' + u.phone.slice(-4);
    });

    success(res, { users, total: countResult[0].total });
  } catch (err) {
    serverError(res, err, '获取用户列表失败');
  }
}

/**
 * 封禁/解封用户
 */
async function toggleUserStatus(req, res) {
  try {
    const userId = parseInt(req.params.id);
    const { action } = req.body; // 'ban' or 'unban'

    if (action === 'ban') {
      await pool.execute('UPDATE users SET status = 0 WHERE id = ?', [userId]);
      return success(res, null, '用户已封禁');
    } else if (action === 'unban') {
      await pool.execute('UPDATE users SET status = 1 WHERE id = ?', [userId]);
      return success(res, null, '用户已解封');
    }
    error(res, 400, '无效操作');
  } catch (err) {
    serverError(res, err, '操作失败');
  }
}

module.exports = { getDashboard, getUserList, toggleUserStatus };
