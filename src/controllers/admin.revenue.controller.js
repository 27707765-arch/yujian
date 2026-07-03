/**
 * 管理员 - 营收统计控制器
 * 按日/周/月统计营收趋势
 */

const { executeQuery } = require('../utils/database');
const { success, serverError } = require('../utils/response');

function safeRows(result) {
  if (!result || !Array.isArray(result)) return [];
  return result;
}

function safeFirst(result, defaultValue = {}) {
  if (!result || !Array.isArray(result) || result.length === 0) return defaultValue;
  return result[0] || defaultValue;
}

/**
 * 获取营收趋势
 * GET /api/admin/revenue/trends?period=day&start_date=2026-06-01&end_date=2026-06-30
 * period: day | week | month
 */
async function getRevenueTrends(req, res) {
  try {
    const { period = 'day', start_date, end_date } = req.query;

    let dateFormat;
    let groupBy;
    switch (period) {
      case 'month':
        dateFormat = '%Y-%m';
        groupBy = 'DATE_FORMAT(o.created_at, \'%Y-%m\')';
        break;
      case 'week':
        dateFormat = '%Y-%u';
        groupBy = 'YEARWEEK(o.created_at, 1)';
        break;
      case 'day':
      default:
        dateFormat = '%Y-%m-%d';
        groupBy = 'DATE(o.created_at)';
        break;
    }

    let query = `SELECT DATE(o.created_at) as date,
      COALESCE(SUM(o.amount), 0) as revenue,
      COUNT(o.id) as order_count
      FROM orders o WHERE o.status = 1`;
    const params = [];

    if (start_date) {
      query += ' AND o.created_at >= ?';
      params.push(start_date);
    }
    if (end_date) {
      query += ' AND o.created_at < DATE_ADD(?, INTERVAL 1 DAY)';
      params.push(end_date);
    }

    // 默认最近30天
    if (!start_date && !end_date) {
      query += ' AND o.created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)';
    }

    query += ` GROUP BY ${groupBy} ORDER BY date ASC`;

    const trends = safeRows(await executeQuery(query, params));

    // 汇总
    const totalRevenue = trends.reduce((sum, t) => sum + Number(t.revenue || 0), 0);
    const totalOrders = trends.reduce((sum, t) => sum + Number(t.order_count || 0), 0);

    success(res, { trends, total_revenue: totalRevenue, total_orders: totalOrders });
  } catch (err) {
    serverError(res, err, '获取营收趋势失败');
  }
}

module.exports = { getRevenueTrends };
