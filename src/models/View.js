const { executeQuery, isDbAvailable } = require('../utils/database');

const memoryStore = [];
let autoIncrementId = 1;

/**
 * Haversine 公式计算两点距离（km）— 访客距离展示
 * @param {number} lat1 - 纬度1
 * @param {number} lng1 - 经度1
 * @param {number} lat2 - 纬度2
 * @param {number} lng2 - 经度2
 * @returns {number} - 距离（km），坐标无效返回 null
 */
function calcDistance(lat1, lng1, lat2, lng2) {
  if (lat1 == null || lng1 == null || lat2 == null || lng2 == null) return null;
  const R = 6371; // 地球半径（km）
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * 访客聚合纯函数：将浏览记录列表按「访客」聚合成一条，并统计访问次数。
 * 返回数组按最近访问时间倒序（原记录按 created_at 倒序传入时）。
 * 被抽为纯函数以便单元测试（无 DB 依赖，符合项目纯逻辑测试文化）。
 * @param {Array<Object>} records - 浏览记录 [{ user_id, target_user_id, created_at }]
 * @param {number} target_user_id - 被浏览者ID（过滤条件）
 * @param {number} limit - 限制数量
 * @param {number} offset - 偏移量
 * @returns {Array<{user_id, target_user_id, visit_count, created_at}>}
 */
function aggregateViewers(records, target_user_id, limit = 20, offset = 0) {
  const grouped = new Map();
  records
    .filter(v => v.target_user_id === target_user_id)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .forEach(v => {
      if (!grouped.has(v.user_id)) {
        grouped.set(v.user_id, { user_id: v.user_id, target_user_id, visit_count: 0, created_at: v.created_at });
      }
      grouped.get(v.user_id).visit_count += 1;
    });
  return Array.from(grouped.values()).slice(offset, offset + limit);
}

class View {
  static async create(user_id, target_user_id) {
    try {
      if (isDbAvailable()) {
        await executeQuery(
          'INSERT INTO user_views (user_id, target_user_id) VALUES (?, ?)',
          [user_id, target_user_id]
        );
      }
    } catch (error) {
      console.error('记录浏览失败:', error.message);
    }
    const record = { id: autoIncrementId++, user_id, target_user_id, created_at: new Date() };
    memoryStore.push(record);
  }

  /**
   * 批量记录浏览（推荐接口：一条 SQL 写入，避免 N 次单条 INSERT 拖慢响应）
   * @param {number} user_id - 浏览者ID
   * @param {Array<number>} targetUserIds - 被浏览用户ID列表
   */
  static async bulkCreate(user_id, targetUserIds) {
    if (!targetUserIds || targetUserIds.length === 0) return;
    try {
      if (isDbAvailable()) {
        const values = targetUserIds.map(() => '(?, ?)').join(',');
        const params = targetUserIds.flatMap(uid => [user_id, uid]);
        await executeQuery(
          `INSERT INTO user_views (user_id, target_user_id) VALUES ${values}`,
          params
        );
      }
    } catch (error) {
      console.error('批量记录浏览失败:', error.message);
    }
    const now = new Date();
    for (const uid of targetUserIds) {
      memoryStore.push({ id: autoIncrementId++, user_id, target_user_id: uid, created_at: now });
    }
  }

  /**
   * 获取访客列表（按访客聚合 + 访问次数 + 最近访问时间）
   * @param {number} target_user_id - 被浏览者ID
   * @param {number} limit - 限制数量
   * @param {number} offset - 偏移量
   * @param {number} [myLat] - 当前用户纬度（用于计算访客距离）
   * @param {number} [myLng] - 当前用户经度
   * @returns {Promise<Array>} 含 visit_count / distance(km) / location 等
   */
  static async getViewers(target_user_id, limit = 20, offset = 0, myLat = null, myLng = null) {
    try {
      if (isDbAvailable()) {
        const [rows] = await executeQuery(
          `SELECT v.user_id, v.target_user_id,
                  COUNT(*) as visit_count,
                  MAX(v.created_at) as created_at,
                  u.nickname, u.avatar, u.gender, u.age, u.location,
                  u.lat as viewer_lat, u.lng as viewer_lng
           FROM user_views v
           LEFT JOIN users u ON v.user_id = u.id
           WHERE v.target_user_id = ?
           GROUP BY v.user_id, v.target_user_id, u.nickname, u.avatar, u.gender, u.age, u.location, u.lat, u.lng
           ORDER BY MAX(v.created_at) DESC
           LIMIT ? OFFSET ?`,
          [target_user_id, parseInt(limit), parseInt(offset)]
        );
        // 计算访客与我的距离（km），并清理内部坐标字段
        return rows.map(row => {
          const distance = calcDistance(myLat, myLng, row.viewer_lat, row.viewer_lng);
          const { viewer_lat, viewer_lng, ...rest } = row;
          return distance === null ? rest : { ...rest, distance: Math.round(distance * 10) / 10 };
        });
      }
    } catch (error) {
      console.error('获取浏览者列表失败:', error.message);
    }
    // 内存降级：按访客聚合（同一访客多次访问合并为一条，visit_count 计次，created_at 取最近一次）
    return aggregateViewers(memoryStore, target_user_id, parseInt(limit), parseInt(offset));
  }

  /**
   * 看过我主页的访客人数（去重）
   * @param {number} target_user_id - 被浏览者ID
   * @returns {Promise<number>}
   */
  static async countViewers(target_user_id) {
    try {
      if (isDbAvailable()) {
        const [rows] = await executeQuery(
          'SELECT COUNT(DISTINCT user_id) as cnt FROM user_views WHERE target_user_id = ?',
          [target_user_id]
        );
        return rows[0]?.cnt || 0;
      }
    } catch (error) {
      console.error('获取浏览者计数失败:', error.message);
    }
    return new Set(memoryStore.filter(v => v.target_user_id === target_user_id).map(v => v.user_id)).size;
  }
}

module.exports = View;
module.exports.aggregateViewers = aggregateViewers;
module.exports.calcDistance = calcDistance;
