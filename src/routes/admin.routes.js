/**
 * 管理员路由
 * 运营后台数据看板、用户管理（需管理员权限）
 */

const express = require('express');
const adminController = require('../controllers/admin.controller');
const authMiddleware = require('../middleware/auth');
const { adminAuth } = require('../middleware/adminAuth');

const router = express.Router();
router.use(authMiddleware);
router.use(adminAuth);

// 数据看板
router.get('/dashboard', adminController.getDashboard);

// 用户列表（管理视图）
router.get('/users', adminController.getUserList);

// 封禁/解封用户
router.put('/users/:id', adminController.toggleUserStatus);

module.exports = router;
