/**
 * VIP增强模型: 贵族等级 + 装扮商城
 */
const { executeQuery, isDbAvailable } = require('../utils/database');

class NobleLevel {
  static async getAll() {
    try { if (isDbAvailable()) { const [r] = await executeQuery('SELECT * FROM noble_levels ORDER BY level ASC'); return r; } } catch(e) { return []; }
  }
  static async getByLevel(level) {
    try { if (isDbAvailable()) { const [r] = await executeQuery('SELECT * FROM noble_levels WHERE level = ?', [level]); return r[0] || null; } } catch(e) { return null; }
  }
}

class DressUpItem {
  static async getByType(type) {
    try { if (isDbAvailable()) { const [r] = await executeQuery('SELECT * FROM dress_up_items WHERE type = ? AND is_active = 1 ORDER BY price ASC', [type]); return r; } } catch(e) { return []; }
  }
  static async findAll() {
    try { if (isDbAvailable()) { const [r] = await executeQuery('SELECT * FROM dress_up_items WHERE is_active = 1 ORDER BY type, price ASC'); return r; } } catch(e) { return []; }
  }
  static async getUserItems(userId) {
    try { if (isDbAvailable()) { const [r] = await executeQuery('SELECT d.*, ud.is_using FROM user_dress_ups ud JOIN dress_up_items d ON ud.item_id = d.id WHERE ud.user_id = ?', [userId]); return r; } } catch(e) { return []; }
  }
  static async purchase(userId, itemId) {
    try { if (isDbAvailable()) {
      await executeQuery('INSERT IGNORE INTO user_dress_ups (user_id, item_id) VALUES (?,?)', [userId, itemId]);
    } } catch(e) {}
  }
  static async setUsing(userId, itemId, isUsing) {
    try { if (isDbAvailable()) {
      await executeQuery('UPDATE user_dress_ups SET is_using = ? WHERE user_id = ? AND item_id = ?', [isUsing ? 1 : 0, userId, itemId]);
    } } catch(e) {}
  }
}

module.exports = { NobleLevel, DressUpItem };
