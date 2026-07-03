/**
 * 认证路由
 * 支持手机+邮箱双通道验证码登录
 */

const express = require('express');
const authController = require('../controllers/auth.controller');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// 发送验证码（手机或邮箱）
router.post('/send-code', authController.sendCode);

// 登录/注册（自动识别手机号或邮箱）
router.post('/login', authController.login);

// 需要认证的路由
router.use(authMiddleware);

// 设置密码
router.post('/set-password', authController.setPassword);

// 绑定邮箱
router.post('/bind-email', authController.bindEmail);

module.exports = router;