/**
 * 用户模型
 * 用于处理用户相关的数据库操作和内存存储
 * 支持用户的创建、查询、更新等操作
 * 当数据库不可用时，自动使用内存存储作为 fallback
 */

const { executeQuery, isDbAvailable } = require('../utils/database');

// 内存存储（当数据库不可用时使用）
const memoryStore = new Map();
// 内存存储的自增ID
let autoIncrementId = 1;

/**
 * Haversine 公式辅助函数：检查两个坐标点是否在指定距离内
 * @param {number} lat1 - 点1纬度
 * @param {number} lng1 - 点1经度
 * @param {number} lat2 - 点2纬度
 * @param {number} lng2 - 点2经度
 * @param {number} maxDistance - 最大距离（km）
 * @returns {boolean} - 是否在距离内
 */
function isWithinDistance(lat1, lng1, lat2, lng2, maxDistance) {
  const R = 6371; // 地球半径（km）
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c <= maxDistance;
}

class User {
  /**
   * 根据手机号查找用户
   * @param {string} phone - 手机号
   * @returns {Promise<Object|null>} - 用户对象或null
   */
  static async findByPhone(phone) {
    try {
      // 优先使用数据库查询
      if (isDbAvailable()) {
        const [rows] = await executeQuery('SELECT * FROM users WHERE phone = ?', [phone]);
        return rows[0] || null;
      }
    } catch (err) {
      console.error('数据库查询失败，使用内存存储:', err.message);
    }

    // 数据库不可用时，使用内存存储
    for (const user of memoryStore.values()) {
      if (user.phone === phone) {
        return user;
      }
    }
    return null;
  }

  /**
   * 根据ID查找用户
   * @param {number} id - 用户ID
   * @returns {Promise<Object|null>} - 用户对象或null
   */
  static async findById(id) {
    try {
      // 优先使用数据库查询
      if (isDbAvailable()) {
        const [rows] = await executeQuery('SELECT * FROM users WHERE id = ?', [id]);
        return rows[0] || null;
      }
    } catch (err) {
      console.error('数据库查询失败，使用内存存储:', err.message);
    }

    // 数据库不可用时，使用内存存储
    return memoryStore.get(id) || null;
  }

  /**
   * 创建新用户
   * @param {Object} userData - 用户数据
   * @param {string} userData.phone - 手机号
   * @param {string} userData.nickname - 昵称
   * @param {string|null} userData.avatar - 头像
   * @param {number|null} userData.gender - 性别
   * @param {number|null} userData.age - 年龄
   * @param {number|null} userData.height - 身高
   * @param {string|null} userData.occupation - 职业
   * @param {string|null} userData.location - 位置
   * @param {number|null} userData.lat - 纬度
   * @param {number|null} userData.lng - 经度
   * @param {string|null} userData.bio - 个人简介
   * @returns {Promise<Object>} - 创建的用户对象
   */
  static async create(userData) {
    try {
      // 优先使用数据库创建
      if (isDbAvailable()) {
        const { phone, nickname, avatar, gender, age, height, occupation, location, lat, lng, bio } = userData;
        const [result] = await executeQuery(
          'INSERT INTO users (phone, nickname, avatar, gender, age, height, occupation, location, lat, lng, bio) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [phone, nickname, avatar, gender, age, height, occupation, location, lat, lng, bio]
        );
        return this.findById(result.insertId);
      }
    } catch (err) {
      console.error('数据库插入失败，使用内存存储:', err.message);
    }

    // 数据库不可用时，使用内存存储
    const id = autoIncrementId++;
    const user = {
      id,
      ...userData,
      role: 'user',
      status: 1,
      is_vip: 0,
      vip_expire_time: null,
      created_at: new Date(),
      updated_at: new Date()
    };
    memoryStore.set(id, user);
    return user;
  }

  /**
   * 更新用户信息
   * @param {number} id - 用户ID
   * @param {Object} userData - 用户数据
   * @returns {Promise<Object|null>} - 更新后的用户对象或null
   */
  static async update(id, userData) {
    try {
      // 优先使用数据库更新
      if (isDbAvailable()) {
        const fields = [];
        const values = [];

        // 构建更新字段和值
        Object.entries(userData).forEach(([key, value]) => {
          fields.push(`${key} = ?`);
          values.push(value);
        });

        values.push(id);

        await executeQuery(
          `UPDATE users SET ${fields.join(', ')} WHERE id = ?`,
          values
        );

        return this.findById(id);
      }
    } catch (err) {
      console.error('数据库更新失败，使用内存存储:', err.message);
    }

    // 数据库不可用时，使用内存存储
    const user = memoryStore.get(id);
    if (user) {
      Object.assign(user, userData, { updated_at: new Date() });
      memoryStore.set(id, user);
      return user;
    }
    return null;
  }

  /**
   * 获取附近的用户（使用 Haversine 公式计算真实地理距离）
   * @param {number} id - 当前用户ID
   * @param {number} lat - 纬度
   * @param {number} lng - 经度
   * @param {number} distance - 距离(km)，默认为10
   * @param {number} limit - 限制数量，默认为10
   * @returns {Promise<Array>} - 附近用户列表
   */
  static async getNearbyUsers(id, lat, lng, distance = 10, limit = 10) {
    try {
      // 优先使用数据库查询（使用 Haversine 公式）
      if (isDbAvailable()) {
        const [rows] = await executeQuery(
          `SELECT *,
            ( 6371 * acos( cos( radians(?) ) * cos( radians( lat ) )
            * cos( radians( lng ) - radians(?) )
            + sin( radians(?) ) * sin( radians( lat ) ) ) ) AS distance
           FROM users
           WHERE id != ?
           AND status = 1
           AND lat IS NOT NULL
           AND lng IS NOT NULL
           HAVING distance < ?
           ORDER BY distance ASC
           LIMIT ?`,
          [lat, lng, lat, id, distance, limit]
        );
        return rows;
      }
    } catch (err) {
      console.error('数据库查询失败，使用内存存储:', err.message);
    }

    // 数据库不可用时，使用内存存储 - 用 Haversine 公式过滤距离
    return Array.from(memoryStore.values())
      .filter(user => {
        if (user.id === id || user.status !== 1) return false;
        if (!user.lat || !user.lng) return false;
        return isWithinDistance(lat, lng, user.lat, user.lng, distance);
      })
      .slice(0, limit);
  }

  /**
   * 更新用户VIP状态
   * @param {number} id - 用户ID
   * @param {boolean} isVip - 是否VIP
   * @param {Date} expireTime - 过期时间
   * @returns {Promise<Object|null>} - 更新后的用户对象或null
   */
  static async updateVipStatus(id, isVip, expireTime) {
    try {
      // 优先使用数据库更新
      if (isDbAvailable()) {
        await executeQuery(
          'UPDATE users SET is_vip = ?, vip_expire_time = ? WHERE id = ?',
          [isVip ? 1 : 0, expireTime, id]
        );
        return this.findById(id);
      }
    } catch (err) {
      console.error('数据库更新失败，使用内存存储:', err.message);
    }

    // 数据库不可用时，使用内存存储
    const user = memoryStore.get(id);
    if (user) {
      user.is_vip = isVip ? 1 : 0;
      user.vip_expire_time = expireTime;
      user.updated_at = new Date();
      return user;
    }
    return null;
  }

  /**
   * 禁用用户
   * @param {number} id - 用户ID
   * @returns {Promise<Object|null>} - 更新后的用户对象或null
   */
  static async disable(id) {
    return this.update(id, { status: 0 });
  }

  /**
   * 启用用户
   * @param {number} id - 用户ID
   * @returns {Promise<Object|null>} - 更新后的用户对象或null
   */
  static async enable(id) {
    return this.update(id, { status: 1 });
  }
}

module.exports = User;
