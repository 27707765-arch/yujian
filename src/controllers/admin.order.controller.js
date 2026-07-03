/**
 * 管理员 - 订单管理控制器
 * 查看所有订单、筛选、营收汇总
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
 * 获取订单列表（管理员视图）
 * GET /api/admin/orders?limit=20&offset=0&status=&user_id=&start_date=&end_date=
 */
async function getOrderList(req, res) {
  try {
    const { limit = 20, offset = 0, status, user_id, start_date, end_date } = req.query;
    let query = `SELECT o.*, u.nickname, u.phone,
      COALESCE(vp.name, CASE WHEN o.package_id = 4 THEN '金币充值' ELSE '未知套餐' END) as package_name
      FROM orders o
      LEFT JOIN users u ON o.user_id = u.id
      LEFT JOIN vip_packages vp ON o.package_id = vp.id
      WHERE 1=1`;
    const params = [];

    if (status !== undefined && status !== '') {
      query += ' AND o.status = ?';
      params.push(parseInt(status, 10));
    }
    if (user_id) {
      query += ' AND o.user_id = ?';
      params.push(parseInt(user_id, 10));
    }
    if (start_date) {
      query += ' AND o.created_at >= ?';
      params.push(start_date);
    }
    if (end_date) {
      query += ' AND o.created_at < DATE_ADD(?, INTERVAL 1 DAY)';
      params.push(end_date);
    }

    // 总数
    const countQuery = query
      .replace(/SELECT o\.\*, u\.nickname, u\.phone,\s+COALESCE\(vp\.name, CASE.*? as package_name\s+FROM/, 'SELECT COUNT(*) as total FROM');
    const total = safeFirst(await executeQuery(countQuery, params), { total: 0 }).total;

    // 汇总统计
    let summaryQuery = query
      .replace(/SELECT o\.\*, u\.nickname, u\.phone,\s+COALESCE\(vp\.name, CASE.*? as package_name\s+FROM/, `SELECT
        COALESCE(SUM(o.amount), 0) as total_revenue,
        SUM(CASE WHEN o.status = 1 THEN 1 ELSE 0 END) as paid_count,
        SUM(CASE WHEN o.status = 0 THEN 1 ELSE 0 END) as pending_count,
        SUM(CASE WHEN o.status = 2 THEN 1 ELSE 0 END) as cancelled_count
      FROM`);
    const summary = safeFirst(await executeQuery(summaryQuery, params), {
      total_revenue: 0, paid_count: 0, pending_count: 0, cancelled_count: 0
    });

    query += ' ORDER BY o.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit, 10), parseInt(offset, 10));

    const orders = safeRows(await executeQuery(query, params));

    // 脱敏手机号
    orders.forEach(o => {
      if (o.phone) o.phone = o.phone.slice(0, 3) + '****' + o.phone.slice(-4);
    });

    success(res, { orders, total, summary });
  } catch (err) {
    serverError(res, err, '获取订单列表失败');
  }
}

module.exports = { getOrderList };
