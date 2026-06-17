/**
 * 签到与任务路由
 */

const express = require('express');
const checkinController = require('../controllers/checkin.controller');
const authMiddleware = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

// 每日签到
router.post('/', checkinController.dailyCheckin);

// 签到状态
router.get('/status', checkinController.getCheckinStatus);

// 每日任务
router.get('/tasks', checkinController.getDailyTasks);

module.exports = router;
