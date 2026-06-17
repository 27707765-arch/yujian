const express = require('express');
const orderController = require('../controllers/order.controller');
const authMiddleware = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

router.post('/vip', orderController.createVipOrder);
router.post('/recharge', orderController.createRechargeOrder);
router.get('/list', orderController.getOrders);

module.exports = router;
