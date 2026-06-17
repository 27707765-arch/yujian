// 文件名：src/routes/report.routes.js
// 用途：举报路由

const express = require('express');
const reportController = require('../controllers/report.controller');
const authMiddleware = require('../middleware/auth');
const { adminAuth } = require('../middleware/adminAuth');

const router = express.Router();

// 需要认证的路由
router.use(authMiddleware);

// 提交举报
router.post('/submit', reportController.submitReport);

// 获取举报列表（管理员功能）
router.get('/list', adminAuth, reportController.getReports);

// 处理举报（管理员功能）
router.put('/:id/handle', adminAuth, reportController.handleReport);

module.exports = router;