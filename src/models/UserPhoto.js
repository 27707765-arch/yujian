/**
 * 用户相册模型
 * 用于处理用户多图相册的数据库操作
 */

const { executeQuery, isDbAvailable } = require('../utils/database');

// 内存存储（降级 fallback）
const memoryStore = new Map();
let autoIncrementId = 1;

class UserPhoto {
  /**
   * 添加照片
   * @param {number} userId - 用户ID
   * @param {string} url - 图片URL
   * @param {number} sortOrder - 排序
   * @returns {Promise<Object>} - 照片记录
   */
  static async create(userId, url, sortOrder = 0) {
    try {
      if (isDbAvailable()) {
        // 如果设为封面，先取消其他封面
        const [result] = await executeQuery(
          'INSERT INTO user_photos (user_id, url, sort_order) VALUES (?, ?, ?)',
          [userId, url, sortOrder]
        );
        // 更新用户照片计数
        await executeQuery(
          'UPDATE users SET photos_count = (SELECT COUNT(*) FROM user_photos WHERE user_id = ? AND status = 1) WHERE id = ?',
          [userId, userId]
        );
        return this.findById(result.insertId);
      }
    } catch (err) {
      console.error('数据库操作失败，使用内存存储:', err.message);
    }

    const id = autoIncrementId++;
    const photo = { id, user_id: userId, url, sort_order: sortOrder, is_cover: 0, status: 1, created_at: new Date() };
    if (!memoryStore.has(userId)) memoryStore.set(userId, []);
    memoryStore.get(userId).push(photo);
    return photo;
  }

  /**
   * 根据ID查找照片
   * @param {number} id - 照片ID
   * @returns {Promise<Object|null>}
   */
  static async findById(id) {
    try {
      if (isDbAvailable()) {
        const [rows] = await executeQuery('SELECT * FROM user_photos WHERE id = ?', [id]);
        return rows[0] || null;
      }
    } catch (err) {
      console.error('数据库查询失败:', err.message);
    }
    for (const [, photos] of memoryStore) {
      const found = photos.find(p => p.id === id);
      if (found) return found;
    }
    return null;
  }

  /**
   * 获取用户照片列表
   * @param {number} userId - 用户ID
   * @returns {Promise<Array>}
   */
  static async getByUserId(userId) {
    try {
      if (isDbAvailable()) {
        const [rows] = await executeQuery(
          'SELECT * FROM user_photos WHERE user_id = ? AND status = 1 ORDER BY sort_order ASC, created_at DESC',
          [userId]
        );
        return rows;
      }
    } catch (err) {
      console.error('数据库查询失败:', err.message);
    }
    return (memoryStore.get(userId) || []).filter(p => p.status === 1);
  }

  /**
   * 设置封面照片
   * @param {number} id - 照片ID
   * @param {number} userId - 用户ID
   * @returns {Promise<boolean>}
   */
  static async setCover(id, userId) {
    try {
      if (isDbAvailable()) {
        // 取消用户所有封面
        await executeQuery('UPDATE user_photos SET is_cover = 0 WHERE user_id = ?', [userId]);
        // 设置新封面
        await executeQuery('UPDATE user_photos SET is_cover = 1 WHERE id = ? AND user_id = ?', [id, userId]);
        // 同步更新用户头像
        const [photo] = await executeQuery('SELECT url FROM user_photos WHERE id = ?', [id]);
        if (photo.length > 0) {
          await executeQuery('UPDATE users SET avatar = ? WHERE id = ?', [photo[0].url, userId]);
        }
        return true;
      }
    } catch (err) {
      console.error('数据库更新失败:', err.message);
    }
    const photos = memoryStore.get(userId) || [];
    photos.forEach(p => { p.is_cover = p.id === id ? 1 : 0; });
    return true;
  }

  /**
   * 删除照片
   * @param {number} id - 照片ID
   * @param {number} userId - 用户ID
   * @returns {Promise<boolean>}
   */
  static async delete(id, userId) {
    try {
      if (isDbAvailable()) {
        const [result] = await executeQuery(
          'UPDATE user_photos SET status = 0 WHERE id = ? AND user_id = ?',
          [id, userId]
        );
        // 更新用户照片计数
        await executeQuery(
          'UPDATE users SET photos_count = (SELECT COUNT(*) FROM user_photos WHERE user_id = ? AND status = 1) WHERE id = ?',
          [userId, userId]
        );
        return result.affectedRows > 0;
      }
    } catch (err) {
      console.error('数据库删除失败:', err.message);
    }
    const photos = memoryStore.get(userId) || [];
    const idx = photos.findIndex(p => p.id === id);
    if (idx !== -1) {
      photos[idx].status = 0;
      return true;
    }
    return false;
  }

  /**
   * 获取用户照片数量
   * @param {number} userId - 用户ID
   * @returns {Promise<number>}
   */
  static async getCount(userId) {
    try {
      if (isDbAvailable()) {
        const [rows] = await executeQuery(
          'SELECT COUNT(*) as count FROM user_photos WHERE user_id = ? AND status = 1',
          [userId]
        );
        return rows[0].count;
      }
    } catch (err) {
      console.error('数据库查询失败:', err.message);
    }
    return (memoryStore.get(userId) || []).filter(p => p.status === 1).length;
  }
}

module.exports = UserPhoto;
