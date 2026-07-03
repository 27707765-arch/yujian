/**
 * 管理员路由
 * 运营后台：数据看板、用户管理、动态管理、举报管理、订单管理、礼物管理、系统视图
 * 所有路由均需管理员权限
 */

const express = require('express');
const adminController = require('../controllers/admin.controller');
const adminPostController = require('../controllers/admin.post.controller');
const adminOrderController = require('../controllers/admin.order.controller');
const adminGiftController = require('../controllers/admin.gift.controller');
const adminReportController = require('../controllers/admin.report.controller');
const adminRevenueController = require('../controllers/admin.revenue.controller');
const authMiddleware = require('../middleware/auth');
const { adminAuth } = require('../middleware/adminAuth');

const router = express.Router();
router.use(authMiddleware);
router.use(adminAuth);

// ==================== 数据看板 ====================
router.get('/dashboard', adminController.getDashboard);
router.get('/dashboard/enhanced', adminController.getDashboardEnhanced);

// ==================== 用户管理 ====================
router.get('/users', adminController.getUserList);
router.put('/users/:id', adminController.toggleUserStatus);

// ==================== 动态管理 ====================
router.get('/posts', adminPostController.getPostList);
router.get('/posts/:id', adminPostController.getPostDetail);
router.put('/posts/:id/status', adminPostController.togglePostStatus);

// ==================== 举报管理 ====================
router.get('/reports', adminReportController.getReportList);
router.put('/reports/:id/handle', adminReportController.handleReport);

// ==================== 订单管理 ====================
router.get('/orders', adminOrderController.getOrderList);

// ==================== 礼物管理 ====================
router.get('/gifts', adminGiftController.getGiftList);
router.post('/gifts', adminGiftController.createGift);
router.put('/gifts/:id', adminGiftController.updateGift);
router.put('/gifts/:id/toggle', adminGiftController.toggleGiftStatus);

// ==================== 礼物记录 & 交易流水 ====================
router.get('/gift-records', adminController.getGiftRecords);
router.get('/transactions', adminController.getTransactionLogs);

// ==================== 营收统计 ====================
router.get('/revenue/trends', adminRevenueController.getRevenueTrends);

module.exports = router;
