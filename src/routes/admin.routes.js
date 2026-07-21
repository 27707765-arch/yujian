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
const adminVerificationController = require('../controllers/admin.verification.controller');
const adminUserController = require('../controllers/admin.user.controller');
const adminContentController = require('../controllers/admin.content.controller');
const adminConfigController = require('../controllers/admin.config.controller');
const adminSystemController = require('../controllers/admin.system.controller');
const adminPushController = require('../controllers/admin.push.controller');
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

// ==================== 认证审核 ====================
router.get('/verifications', adminVerificationController.getVerificationList);
router.get('/verifications/stats', adminVerificationController.getVerificationStats);
router.put('/verifications/:id/approve', adminVerificationController.approveVerification);
router.put('/verifications/:id/reject', adminVerificationController.rejectVerification);

// ==================== 用户详情管理 ====================
router.get('/users/:id', adminUserController.getUserDetail);
router.get('/users/:id/wallet', adminUserController.getUserWallet);
router.put('/users/:id/profile', adminUserController.updateUserProfile);
router.post('/users/:id/reset-password', adminUserController.resetUserPassword);
router.put('/users/:id/note', adminUserController.updateUserNote);

// ==================== 内容审核 ====================
router.get('/sensitive-words', adminContentController.getSensitiveWords);
router.post('/sensitive-words', adminContentController.createSensitiveWord);
router.put('/sensitive-words/:id', adminContentController.updateSensitiveWord);
router.delete('/sensitive-words/:id', adminContentController.deleteSensitiveWord);
router.post('/sensitive-words/batch-import', adminContentController.batchImportSensitiveWords);
router.get('/audit/queue', adminContentController.getAuditQueue);
router.put('/audit/:id/approve', adminContentController.approveContent);
router.put('/audit/:id/reject', adminContentController.rejectContent);
router.get('/audit/stats', adminContentController.getAuditStats);

// ==================== 系统配置 ====================
router.get('/configs', adminConfigController.getConfigs);
router.put('/configs/:key', adminConfigController.updateConfig);
router.get('/announcements', adminConfigController.getAnnouncements);
router.post('/announcements', adminConfigController.createAnnouncement);
router.put('/announcements/:id', adminConfigController.updateAnnouncement);
router.delete('/announcements/:id', adminConfigController.deleteAnnouncement);
router.put('/announcements/:id/publish', adminConfigController.publishAnnouncement);
router.put('/announcements/:id/offline', adminConfigController.offlineAnnouncement);

// ==================== 管理员管理 ====================
router.get('/admins', adminSystemController.getAdminList);
router.post('/admins', adminSystemController.createAdmin);
router.put('/admins/:id', adminSystemController.updateAdmin);
router.delete('/admins/:id', adminSystemController.deleteAdmin);
router.get('/operation-logs', adminSystemController.getOperationLogs);

// ==================== 推送管理 ====================
router.post('/push/send', adminPushController.sendPush);
router.get('/push/history', adminPushController.getPushHistory);
router.get('/push/templates', adminPushController.getTemplates);
router.post('/push/templates', adminPushController.createTemplate);
router.delete('/push/templates/:id', adminPushController.deleteTemplate);

// ==================== 数据统计 ====================
router.get('/stats/users/trend', adminPushController.getUserTrend);
router.get('/stats/revenue/trend', adminPushController.getRevenueTrend);
router.get('/stats/matches/overview', adminPushController.getMatchStats);

module.exports = router;
