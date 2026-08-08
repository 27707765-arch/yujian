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

// 提现（模拟通道）
router.post('/withdraw', walletController.withdraw);

// 提现记录
router.get('/withdraws', walletController.getWithdraws);

module.exports = router;
