/**
 * 礼物路由
 */

const express = require('express');
const giftController = require('../controllers/gift.controller');
const authMiddleware = require('../middleware/auth');
const contentAuditMiddleware = require('../middleware/contentAudit');

const router = express.Router();
router.use(authMiddleware);

// 获取礼物列表
router.get('/list', giftController.getGiftList);

// 赠送礼物（含留言内容审核）
router.post('/send', contentAuditMiddleware({ fields: ['message'] }), giftController.sendGift);

// 收到的礼物
router.get('/received', giftController.getReceivedGifts);

// 送出的礼物
router.get('/sent', giftController.getSentGifts);

module.exports = router;
