/**
 * 拉黑路由
 * 处理用户拉黑/取消拉黑相关API
 */

const express = require('express');
const blockController = require('../controllers/block.controller');
const authMiddleware = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

// 拉黑用户
router.post('/add', blockController.blockUser);

// 取消拉黑
router.post('/remove', blockController.unblockUser);

// 获取拉黑列表
router.get('/list', blockController.getBlockList);

// 检查是否已拉黑某用户
router.get('/check', blockController.checkBlocked);

module.exports = router;
