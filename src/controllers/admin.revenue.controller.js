/**
 * 管理员 - 营收统计控制器
 * 按日/周/月统计营收趋势
 */

const { executeQuery } = require('../utils/database');
const { success, serverError } = require('../utils/response');

function safeRows(result) {
  if (!result) return [];
  // executeQuery 返回 [rows, fields]，取第一层 rows；内存降级时返回 [[], []]
  if (Array.isArray(result) && Array.isArray(result[0])) return result[0] || [];
  if (Array.isArray(result)) return result;
  return [];
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

    let groupBy;
    switch (period) {
      case 'month':
        groupBy = 'DATE_FORMAT(o.created_at, \'%Y-%m\')';
        break;
      case 'week':
        // 用 ISO 周（年-W周号）展示，分组与 SELECT 同一表达式避免 only_full_group_by 报错
        groupBy = 'DATE_FORMAT(o.created_at, \'%Y-W%u\')';
        break;
      case 'day':
      default:
        groupBy = 'DATE_FORMAT(o.created_at, \'%Y-%m-%d\')';
        break;
    }

    // 关键修复：SELECT 的 date 字段必须与 GROUP BY 使用同一个表达式，
    // 否则 only_full_group_by 下报「非聚合列不在 GROUP BY 中」错误。
    let query = `SELECT ${groupBy} as date,
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
