// 文件名：src/routes/chat.routes.js
// 用途：聊天路由

const express = require('express');
const chatController = require('../controllers/chat.controller');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// 需要认证的路由
router.use(authMiddleware);

// 获取会话列表
router.get('/conversations', chatController.getConversations);

// 创建或获取会话
router.post('/conversations', chatController.createConversation);

// 获取消息列表
router.get('/messages', chatController.getMessages);

// 标记消息为已读
router.post('/mark-read', chatController.markAsRead);

// 获取未读消息数
router.get('/unread-count', chatController.getUnreadCount);

module.exports = router;