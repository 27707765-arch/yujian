/**
 * 钱包路由
 */

const express = require('express');
const walletController = require('../controllers/wallet.controller');
const authMiddleware = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

// 钱包信息
router.get('/info', walletController.getWallet);

// 交易流水
router.get('/transactions', walletController.getTransactions);

// 消费统计
router.get('/stats', walletController.getConsumptionStats);

module.exports = router;
