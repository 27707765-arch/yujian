/**
 * 通话路由
 * 处理语音/视频通话相关API
 * 注意：通话信令主要通过WebSocket传输，这些HTTP接口用于记录管理
 */

const express = require('express');
const auth = require('../middleware/auth');
const callController = require('../controllers/call.controller');

const router = express.Router();

// 所有通话接口需要登录
router.use(auth);

// 通话操作
router.post('/initiate', callController.initiateCall);
router.post('/accept', callController.acceptCall);
router.post('/reject', callController.rejectCall);
router.post('/end', callController.endCall);

// 通话历史
router.get('/history', callController.getCallHistory);

module.exports = router;
