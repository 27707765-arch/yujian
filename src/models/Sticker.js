/**
 * 贴纸模型
 * 管理表情贴纸的增删改查
 */
const { executeQuery, isDbAvailable } = require('../utils/database');
const { cacheGet, cacheSet, cacheDel } = require('../config/redis');

const CACHE_KEY = 'sticker:list:active';
const CACHE_TTL = 3600;

const memoryStore = new Map();
let autoIncrementId = 1;

class Sticker {
  static async getAll(filters = {}) {
    const { is_vip, category } = filters;
    try {
      if (isDbAvailable()) {
        let sql = 'SELECT * FROM stickers WHERE is_active = 1';
        const params = [];
        if (is_vip !== undefined) { sql += ' AND is_vip = ?'; params.push(is_vip); }
        if (category) { sql += ' AND category = ?'; params.push(category); }
        sql += ' ORDER BY sort_order ASC, id ASC';
        const [rows] = await executeQuery(sql, params);
        return rows;
      }
    } catch (err) { console.error('查询贴纸列表失败:', err.message); }
    return Array.from(memoryStore.values()).filter(s => s.is_active === 1).sort((a,b) => a.sort_order - b.sort_order || a.id - b.id);
  }

  static async findById(id) {
    try {
      if (isDbAvailable()) {
        const [rows] = await executeQuery('SELECT * FROM stickers WHERE id = ?', [id]);
        return rows[0] || null;
      }
    } catch (err) { console.error('查询贴纸失败:', err.message); }
    return memoryStore.get(id) || null;
  }

  static async create(data) {
    try {
      if (isDbAvailable()) {
        const [result] = await executeQuery(
          'INSERT INTO stickers (name, url, category, is_vip, is_active, sort_order) VALUES (?, ?, ?, ?, ?, ?)',
          [data.name, data.url, data.category || '普通', data.is_vip || 0, data.is_active !== undefined ? data.is_active : 1, data.sort_order || 0]
        );
        cacheDel(CACHE_KEY).catch(() => {});
        return this.findById(result.insertId);
      }
    } catch (err) { console.error('创建贴纸失败:', err.message); }
    const id = autoIncrementId++;
    const sticker = { id, ...data, is_active: 1, created_at: new Date() };
    memoryStore.set(id, sticker);
    return sticker;
  }

  static async update(id, data) {
    try {
      if (isDbAvailable()) {
        const fields = []; const values = [];
        for (const [k, v] of Object.entries(data)) {
          if (['name','url','category','is_vip','is_active','sort_order'].includes(k)) {
            fields.push(`\`${k}\` = ?`); values.push(v);
          }
        }
        if (fields.length > 0) {
          values.push(id);
          await executeQuery(`UPDATE stickers SET ${fields.join(', ')} WHERE id = ?`, values);
          cacheDel(CACHE_KEY).catch(() => {});
        }
        return this.findById(id);
      }
    } catch (err) { console.error('更新贴纸失败:', err.message); }
    const s = memoryStore.get(id);
    if (s) { Object.assign(s, data); memoryStore.set(id, s); }
    return s;
  }

  static async delete(id) {
    try {
      if (isDbAvailable()) {
        await executeQuery('UPDATE stickers SET is_active = 0 WHERE id = ?', [id]);
        cacheDel(CACHE_KEY).catch(() => {});
        return true;
      }
    } catch (err) { console.error('删除贴纸失败:', err.message); }
    memoryStore.delete(id); return true;
  }

  /** 获取缓存的热门贴纸列表 */
  static async getCachedList() {
    const cached = await cacheGet(CACHE_KEY);
    if (cached) return cached;
    const list = await this.getAll();
    cacheSet(CACHE_KEY, list, CACHE_TTL).catch(() => {});
    return list;
  }
}

module.exports = Sticker;
