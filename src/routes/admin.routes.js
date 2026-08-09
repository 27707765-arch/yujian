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
const { adminAuth, requirePerm } = require('../middleware/adminAuth');

const router = express.Router();
router.use(authMiddleware);
router.use(adminAuth);

// ==================== 当前管理员信息（权限初始化） ====================
router.get('/me', adminSystemController.getMe);

// ==================== 数据看板（所有 admin 可读，含趋势/待审卡片数据） ====================
router.get('/dashboard', adminController.getDashboard);
router.get('/dashboard/enhanced', adminController.getDashboardEnhanced);

// ==================== 用户管理 ====================
router.get('/users', requirePerm('user_view'), adminController.getUserList);
router.put('/users/:id', requirePerm('user_ban'), adminController.toggleUserStatus);

// ==================== 动态管理 ====================
router.get('/posts', adminPostController.getPostList);
router.get('/posts/:id', adminPostController.getPostDetail);
router.put('/posts/:id/status', requirePerm('content_audit'), adminPostController.togglePostStatus);

// ==================== 举报管理 ====================
router.get('/reports', adminReportController.getReportList);
router.put('/reports/:id/handle', requirePerm('report_handle'), adminReportController.handleReport);

// ==================== 订单管理 ====================
router.get('/orders', requirePerm('data_view'), adminOrderController.getOrderList);

// ==================== 礼物管理 ====================
router.get('/gifts', requirePerm('data_view'), adminGiftController.getGiftList);
router.post('/gifts', requirePerm('data_view'), adminGiftController.createGift);
router.put('/gifts/:id', requirePerm('data_view'), adminGiftController.updateGift);
router.put('/gifts/:id/toggle', requirePerm('data_view'), adminGiftController.toggleGiftStatus);

// ==================== 礼物记录 & 交易流水 ====================
router.get('/gift-records', requirePerm('data_view'), adminController.getGiftRecords);
router.get('/transactions', requirePerm('data_view'), adminController.getTransactionLogs);

// ==================== 营收统计 ====================
router.get('/revenue/trends', requirePerm('data_view'), adminRevenueController.getRevenueTrends);

// ==================== 认证审核（列表所有 admin 可读，操作需权限） ====================
router.get('/verifications', adminVerificationController.getVerificationList);
router.get('/verifications/stats', adminVerificationController.getVerificationStats);
router.put('/verifications/:id/approve', requirePerm('verification_audit'), adminVerificationController.approveVerification);
router.put('/verifications/:id/reject', requirePerm('verification_audit'), adminVerificationController.rejectVerification);

// ==================== 用户详情管理 ====================
router.get('/users/:id', requirePerm('user_view'), adminUserController.getUserDetail);
router.get('/users/:id/wallet', requirePerm('user_view'), adminUserController.getUserWallet);
router.get('/users/:id/posts', requirePerm('user_view'), adminUserController.getUserPosts);
router.get('/users/:id/messages', requirePerm('user_view'), adminUserController.getUserMessages);
router.get('/users/:id/verifications', requirePerm('user_view'), adminUserController.getUserVerifications);
router.get('/users/:id/behaviors', requirePerm('user_view'), adminUserController.getUserBehaviors);
router.get('/users/:id/behaviors/all', requirePerm('user_view'), adminUserController.getUserBehaviorsAll);
router.put('/users/:id/profile', requirePerm('user_edit'), adminUserController.updateUserProfile);
router.post('/users/:id/reset-password', requirePerm('user_edit'), adminUserController.resetUserPassword);
router.put('/users/:id/note', requirePerm('user_edit'), adminUserController.updateUserNote);

// ==================== 内容审核 ====================
router.get('/sensitive-words', adminContentController.getSensitiveWords);
router.post('/sensitive-words', requirePerm('content_audit'), adminContentController.createSensitiveWord);
router.put('/sensitive-words/:id', requirePerm('content_audit'), adminContentController.updateSensitiveWord);
router.delete('/sensitive-words/:id', requirePerm('content_audit'), adminContentController.deleteSensitiveWord);
router.post('/sensitive-words/batch-import', requirePerm('content_audit'), adminContentController.batchImportSensitiveWords);
router.get('/audit/queue', adminContentController.getAuditQueue);
router.put('/audit/:id/approve', requirePerm('content_audit'), adminContentController.approveContent);
router.put('/audit/:id/reject', requirePerm('content_audit'), adminContentController.rejectContent);
router.get('/audit/stats', adminContentController.getAuditStats);

// ==================== 系统配置 ====================
router.get('/configs', adminConfigController.getConfigs);
router.put('/configs/:key', requirePerm('admin_manage'), adminConfigController.updateConfig);
router.get('/announcements', requirePerm('admin_manage'), adminConfigController.getAnnouncements);
router.post('/announcements', requirePerm('admin_manage'), adminConfigController.createAnnouncement);
router.put('/announcements/:id', requirePerm('admin_manage'), adminConfigController.updateAnnouncement);
router.delete('/announcements/:id', requirePerm('admin_manage'), adminConfigController.deleteAnnouncement);
router.put('/announcements/:id/publish', requirePerm('admin_manage'), adminConfigController.publishAnnouncement);
router.put('/announcements/:id/offline', requirePerm('admin_manage'), adminConfigController.offlineAnnouncement);

// ==================== 管理员管理 ====================
router.get('/admins', requirePerm('admin_manage'), adminSystemController.getAdminList);
router.post('/admins', requirePerm('admin_manage'), adminSystemController.createAdmin);
router.put('/admins/:id', requirePerm('admin_manage'), adminSystemController.updateAdmin);
router.delete('/admins/:id', requirePerm('admin_manage'), adminSystemController.deleteAdmin);
router.get('/operation-logs', requirePerm('admin_manage'), adminSystemController.getOperationLogs);

// ==================== 推送管理 ====================
router.post('/push/send', requirePerm('push_send'), adminPushController.sendPush);
router.get('/push/history', adminPushController.getPushHistory);
router.get('/push/templates', adminPushController.getTemplates);
router.post('/push/templates', requirePerm('push_send'), adminPushController.createTemplate);
router.delete('/push/templates/:id', requirePerm('push_send'), adminPushController.deleteTemplate);

// ==================== 数据统计 ====================
router.get('/stats/users/trend', requirePerm('data_view'), adminPushController.getUserTrend);
router.get('/stats/revenue/trend', requirePerm('data_view'), adminPushController.getRevenueTrend);
router.get('/stats/matches/overview', requirePerm('data_view'), adminPushController.getMatchStats);

module.exports = router;
