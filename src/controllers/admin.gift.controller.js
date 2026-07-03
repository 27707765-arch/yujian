/**
 * 管理员 - 礼物管理控制器
 * CRUD 礼物目录、上下架切换
 */

const { executeQuery } = require('../utils/database');
const { success, error, serverError } = require('../utils/response');
const Gift = require('../models/Gift');

function safeRows(result) {
  if (!result || !Array.isArray(result)) return [];
  return result;
}

function safeFirst(result, defaultValue = {}) {
  if (!result || !Array.isArray(result) || result.length === 0) return defaultValue;
  return result[0] || defaultValue;
}

/**
 * 获取所有礼物（含已下架）
 * GET /api/admin/gifts
 */
async function getGiftList(req, res) {
  try {
    const gifts = safeRows(
      await executeQuery('SELECT * FROM gifts ORDER BY sort_order ASC, id ASC')
    );
    success(res, gifts);
  } catch (err) {
    serverError(res, err, '获取礼物列表失败');
  }
}

/**
 * 新增礼物
 * POST /api/admin/gifts
 * Body: { name, image, price, animation_type, category, sort_order }
 */
async function createGift(req, res) {
  try {
    const { name, image, price, animation_type = 'normal', category = '通用', sort_order = 0 } = req.body;

    if (!name || !name.trim()) return error(res, 400, '礼物名称不能为空');
    if (!price || isNaN(price) || Number(price) <= 0) return error(res, 400, '请填写有效的礼物价格');

    const result = await executeQuery(
      'INSERT INTO gifts (name, image, price, animation_type, category, sort_order, is_active) VALUES (?, ?, ?, ?, ?, ?, 1)',
      [name.trim(), image || null, Number(price), animation_type, category, parseInt(sort_order, 10) || 0]
    );

    const gift = safeFirst(
      await executeQuery('SELECT * FROM gifts WHERE id = ?', [result.insertId])
    );

    success(res, gift, '礼物创建成功');
    Gift.clearListCache().catch(() => {}); // 清除缓存
  } catch (err) {
    serverError(res, err, '创建礼物失败');
  }
}

/**
 * 更新礼物
 * PUT /api/admin/gifts/:id
 * Body: { name?, image?, price?, animation_type?, category?, sort_order?, is_active? }
 */
async function updateGift(req, res) {
  try {
    const giftId = parseInt(req.params.id, 10);
    if (isNaN(giftId)) return error(res, 400, '礼物ID无效');

    const existing = safeFirst(await executeQuery('SELECT * FROM gifts WHERE id = ?', [giftId]));
    if (!existing.id) return error(res, 404, '礼物不存在');

    const fields = [];
    const params = [];

    if (req.body.name !== undefined) { fields.push('name = ?'); params.push(req.body.name.trim()); }
    if (req.body.image !== undefined) { fields.push('image = ?'); params.push(req.body.image); }
    if (req.body.price !== undefined) { fields.push('price = ?'); params.push(Number(req.body.price)); }
    if (req.body.animation_type !== undefined) { fields.push('animation_type = ?'); params.push(req.body.animation_type); }
    if (req.body.category !== undefined) { fields.push('category = ?'); params.push(req.body.category); }
    if (req.body.sort_order !== undefined) { fields.push('sort_order = ?'); params.push(parseInt(req.body.sort_order, 10)); }
    if (req.body.is_active !== undefined) { fields.push('is_active = ?'); params.push(req.body.is_active ? 1 : 0); }

    if (fields.length === 0) return error(res, 400, '没有需要更新的字段');

    params.push(giftId);
    await executeQuery(`UPDATE gifts SET ${fields.join(', ')} WHERE id = ?`, params);

    const updated = safeFirst(await executeQuery('SELECT * FROM gifts WHERE id = ?', [giftId]));
    success(res, updated, '礼物更新成功');
    Gift.clearListCache().catch(() => {}); // 清除缓存
  } catch (err) {
    serverError(res, err, '更新礼物失败');
  }
}

/**
 * 切换礼物上架/下架
 * PUT /api/admin/gifts/:id/toggle
 * Body: { is_active: 0 | 1 }
 */
async function toggleGiftStatus(req, res) {
  try {
    const giftId = parseInt(req.params.id, 10);
    if (isNaN(giftId)) return error(res, 400, '礼物ID无效');

    const { is_active } = req.body;
    if (is_active !== 0 && is_active !== 1) return error(res, 400, 'is_active 必须为 0 或 1');

    const existing = safeFirst(await executeQuery('SELECT id FROM gifts WHERE id = ?', [giftId]));
    if (!existing.id) return error(res, 404, '礼物不存在');

    await executeQuery('UPDATE gifts SET is_active = ? WHERE id = ?', [is_active, giftId]);

    success(res, null, is_active ? '礼物已上架' : '礼物已下架');
    Gift.clearListCache().catch(() => {}); // 清除缓存
  } catch (err) {
    serverError(res, err, '操作失败');
  }
}

module.exports = { getGiftList, createGift, updateGift, toggleGiftStatus };
