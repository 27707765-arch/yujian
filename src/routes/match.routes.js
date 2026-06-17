// 文件名：src/routes/match.routes.js
// 用途：匹配路由

const express = require('express');
const matchController = require('../controllers/match.controller');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// 需要认证的路由
router.use(authMiddleware);

// 推荐用户
router.get('/recommend', matchController.recommendUsers);

// 喜欢用户
router.post('/like', matchController.likeUser);

// 跳过用户
router.post('/skip', matchController.skipUser);

// 获取匹配列表
router.get('/matches', matchController.getMatches);

// 解除匹配
router.post('/unmatch', matchController.unmatch);

// 获取喜欢列表
router.get('/likes', matchController.getLikes);

module.exports = router;