/**
 * 贴纸路由
 */
const express = require('express');
const authMiddleware = require('../middleware/auth');
const Sticker = require('../models/Sticker');
const { success, serverError } = require('../utils/response');

const router = express.Router();

// 获取贴纸列表（无需认证）
router.get('/', async (req, res) => {
  try {
    const filters = {};
    if (req.query.vip_only === '1') filters.is_vip = 1;
    if (req.query.category) filters.category = req.query.category;
    const list = await Sticker.getAll(filters);
    success(res, list);
  } catch (err) { serverError(res, err, '获取贴纸列表失败'); }
});

// 需要认证和管理员权限的操作
router.use(authMiddleware);

// 获取单个贴纸
router.get('/:id', async (req, res) => {
  try {
    const sticker = await Sticker.findById(parseInt(req.params.id));
    if (!sticker) return res.status(404).json({ code: 404, message: '贴纸不存在', data: null });
    success(res, sticker);
  } catch (err) { serverError(res, err, '获取贴纸失败'); }
});

module.exports = router;
