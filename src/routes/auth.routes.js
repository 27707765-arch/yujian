/**
 * 认证路由
 * 处理用户认证相关的API端点，包括发送验证码和登录/注册
 */

const express = require('express');
const authController = require('../controllers/auth.controller');

// 创建路由器实例
const router = express.Router();

/**
 * 发送验证码
 * @route POST /api/auth/send-code
 * @description 向用户手机号发送验证码
 * @body {string} phone - 用户手机号
 * @returns {Object} 响应结果
 */
router.post('/send-code', authController.sendCode);

/**
 * 登录/注册
 * @route POST /api/auth/login
 * @description 使用手机号和验证码登录，不存在则自动注册
 * @body {string} phone - 用户手机号
 * @body {string} code - 验证码
 * @returns {Object} 响应结果，包含token和用户信息
 */
router.post('/login', authController.login);

module.exports = router;