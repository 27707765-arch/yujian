/**
 * 支付回调路由（S23 预留）
 * 支付平台回调走验签而非 Bearer Token，因此独立于 /api/orders（不挂 authMiddleware）
 */
const express = require('express');
const orderController = require('../controllers/order.controller');

const router = express.Router();

// 支付平台异步回调：POST /api/payment/notify/:provider
// provider = simulate | wechat | alipay
router.post('/notify/:provider', orderController.handleNotify);

module.exports = router;
