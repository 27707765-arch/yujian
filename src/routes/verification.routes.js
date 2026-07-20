/**
 * 认证路由
 * 处理多重身份认证相关API
 * 所有路由需要JWT认证
 */

const express = require('express');
const auth = require('../middleware/auth');
const verificationController = require('../controllers/verification.controller');

const router = express.Router();

// 所有认证接口需要登录
router.use(auth);

// 提交各类认证
router.post('/real-name', verificationController.submitRealNameVerification);
router.post('/face', verificationController.submitFaceVerification);
router.post('/education', verificationController.submitEducationVerification);
router.post('/vehicle', verificationController.submitVehicleVerification);

// 查询认证状态和详情
router.get('/status', verificationController.getVerificationStatus);
router.get('/detail/:type', verificationController.getVerificationDetail);

module.exports = router;
