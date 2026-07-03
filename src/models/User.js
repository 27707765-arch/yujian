/**
 * 用户模型
 * 用于处理用户相关的数据库操作和内存存储
 * 支持用户的创建、查询、更新等操作
 * 当数据库不可用时，自动使用内存存储作为 fallback
 */

const { executeQuery, isDbAvailable } = require('../utils/database');
const { cacheGet, cacheSet, cacheDel } = require('../config/redis');

const CACHE_TTL_USER = 300; // 用户缓存 5 分钟

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

// User.update() 允许更新的列白名单（防止任意列注入）
const ALLOWED_UPDATE_COLUMNS = new Set([
  'nickname', 'avatar', 'gender', 'age', 'height', 'occupation',
  'location', 'province', 'city', 'district', 'lat', 'lng', 'bio',
  'tags', 'status', 'is_vip', 'vip_expire_time', 'onboarding_completed',
  'email', 'email_verified', 'password_hash'
]);

class User {
  /**
   * 根据邮箱查找用户
   * @param {string} email - 邮箱
   * @returns {Promise<Object|null>}
   */
  static async findByEmail(email) {
    try {
      if (isDbAvailable()) {
        const [rows] = await executeQuery('SELECT * FROM users WHERE email = ? AND email_verified = 1', [email]);
        return rows[0] || null;
      }
    } catch (err) {
      console.error('数据库查询失败，使用内存存储:', err.message);
    }
    for (const user of memoryStore.values()) {
      if (user.email === email && user.email_verified) return user;
    }
    return null;
  }

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
    // ① 先查 Redis 缓存
    const cacheKey = `user:${id}:profile`;
    try {
      const cached = await cacheGet(cacheKey);
      if (cached) return cached;
    } catch (err) {
      // 缓存读取失败，降级到直接查数据库
    }

    // ② 缓存未命中 → 查数据库
    try {
      if (isDbAvailable()) {
        const [rows] = await executeQuery('SELECT * FROM users WHERE id = ?', [id]);
        const user = rows[0] || null;
        // ③ 写入 Redis 缓存
        if (user) {
          cacheSet(cacheKey, user, CACHE_TTL_USER).catch(() => {});
        }
        return user;
      }
    } catch (err) {
      console.error('数据库查询失败，使用内存存储:', err.message);
    }

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
      if (isDbAvailable()) {
        const { phone, email, nickname, avatar, gender, age, height, occupation, location, lat, lng, bio, email_verified } = userData;
        const [result] = await executeQuery(
          'INSERT INTO users (phone, email, nickname, avatar, gender, age, height, occupation, location, lat, lng, bio, email_verified) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [phone || null, email || null, nickname, avatar || null, gender || null, age || null, height || null, occupation || null, location || null, lat || null, lng || null, bio || null, email_verified || 0]
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

        // 构建更新字段和值（仅允许白名单列，防止任意列注入）
        Object.entries(userData).forEach(([key, value]) => {
          if (!ALLOWED_UPDATE_COLUMNS.has(key)) {
            console.warn(`User.update: 忽略非白名单列 "${key}"`);
            return;
          }
          fields.push(`\`${key}\` = ?`);
          values.push(value);
        });

        values.push(id);

        await executeQuery(
          `UPDATE users SET ${fields.join(', ')} WHERE id = ?`,
          values
        );

        // 淘汰 Redis 缓存（避免脏数据）
        cacheDel(`user:${id}:profile`).catch(() => {});

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
   * 获取同城市用户（按 city 字段匹配）
   * @param {number} id - 排除的当前用户ID
   * @param {string} city - 城市名
   * @param {number} limit - 限制数量，默认为20
   * @returns {Promise<Array>} - 同城用户列表（按创建时间倒序）
   */
  static async getUsersByCity(id, city, limit = 20) {
    try {
      // 优先使用数据库查询（走 idx_users_city 索引）
      if (isDbAvailable()) {
        const [rows] = await executeQuery(
          `SELECT id, nickname, avatar, gender, age, height, occupation,
                  location, province, city, district, bio, tags, is_vip, lat, lng
           FROM users
           WHERE id != ?
             AND city = ?
             AND status = 1
           ORDER BY created_at DESC
           LIMIT ?`,
          [id, city, limit]
        );
        return rows;
      }
    } catch (err) {
      console.error('数据库查询失败，使用内存存储:', err.message);
    }

    // 数据库不可用时，使用内存存储
    return Array.from(memoryStore.values())
      .filter(user => user.id !== id && user.status === 1 && user.city === city)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, limit);
  }

  /**
   * 获取附近的用户（使用 Haversine 公式计算真实地理距离）
   * 采用 Bounding Box 预过滤，先用 lat/lng 范围框缩小候选集，再算 Haversine 距离，避免全表扫描
   * @param {number} id - 当前用户ID
   * @param {number} lat - 纬度
   * @param {number} lng - 经度
   * @param {number} distance - 距离(km)，默认为20
   * @param {number} limit - 限制数量，默认为20
   * @returns {Promise<Array>} - 附近用户列表
   */
  static async getNearbyUsers(id, lat, lng, distance = 20, limit = 20) {
    try {
      // 优先使用数据库查询（Bounding Box 预过滤 + Haversine 公式）
      if (isDbAvailable()) {
        // 计算 Bounding Box：1° 纬度约 111km，经度随纬度变化
        const latDelta = distance / 111;
        const lngDelta = distance / (111 * Math.cos(lat * Math.PI / 180));
        const minLat = lat - latDelta;
        const maxLat = lat + latDelta;
        const minLng = lng - lngDelta;
        const maxLng = lng + lngDelta;

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
             AND lat BETWEEN ? AND ?
             AND lng BETWEEN ? AND ?
           HAVING distance < ?
           ORDER BY distance ASC
           LIMIT ?`,
          [lat, lng, lat, id, minLat, maxLat, minLng, maxLng, distance, limit]
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

  /**
   * 获取新手引导完成状态
   * 返回三步完成情况：头像、标签、个性签名
   * @param {number} userId - 用户ID
   * @returns {Promise<Object>} - { completed, avatar, tags, bio, onboarding_completed }
   */
  static async getOnboardingStatus(userId) {
    try {
      if (isDbAvailable()) {
        const [rows] = await executeQuery(
          'SELECT avatar, tags, bio, onboarding_completed FROM users WHERE id = ?',
          [userId]
        );
        if (!rows || rows.length === 0) return null;
        const user = rows[0];
        // 解析 tags（数据库存储为 JSON 字符串）
        let tagsArray = [];
        if (user.tags) {
          try {
            tagsArray = typeof user.tags === 'string' ? JSON.parse(user.tags) : user.tags;
          } catch (e) { tagsArray = []; }
        }
        return {
          completed: !!user.onboarding_completed,
          avatar: !!user.avatar,
          tags: Array.isArray(tagsArray) && tagsArray.length >= 3,
          bio: !!(user.bio && user.bio.length >= 2),
          onboarding_completed: !!user.onboarding_completed
        };
      }
    } catch (err) {
      console.error('查询引导状态失败:', err.message);
    }
    // 内存降级
    const u = memoryStore.get(userId);
    if (!u) return null;
    const tagsArray = Array.isArray(u.tags) ? u.tags : [];
    return {
      completed: !!u.onboarding_completed,
      avatar: !!u.avatar,
      tags: tagsArray.length >= 3,
      bio: !!(u.bio && u.bio.length >= 2),
      onboarding_completed: !!u.onboarding_completed
    };
  }

  /**
   * 标记新手引导已完成
   * @param {number} userId - 用户ID
   * @returns {Promise<boolean>} - 是否更新成功
   */
  static async completeOnboarding(userId) {
    try {
      if (isDbAvailable()) {
        const [result] = await executeQuery(
          'UPDATE users SET onboarding_completed = 1 WHERE id = ? AND onboarding_completed = 0',
          [userId]
        );
        return result.affectedRows > 0;
      }
    } catch (err) {
      console.error('更新引导状态失败:', err.message);
    }
    // 内存降级
    const u = memoryStore.get(userId);
    if (!u) return false;
    if (u.onboarding_completed) return false; // 已完成，不重复
    u.onboarding_completed = 1;
    memoryStore.set(userId, u);
    return true;
  }
}

module.exports = User;
