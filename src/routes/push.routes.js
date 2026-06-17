/**
 * 推送路由
 * 处理设备Token注册/注销
 */

const express = require('express');
const pushController = require('../controllers/push.controller');
const authMiddleware = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

// 注册设备Token
router.post('/register', pushController.registerToken);

// 注销设备Token
router.post('/unregister', pushController.unregisterToken);

module.exports = router;
