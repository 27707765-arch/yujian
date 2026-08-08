const express = require('express');
const authMiddleware = require('../middleware/auth');
const uploadService = require('../services/upload.service');
const cc = require('../controllers/community.controller');
const router = express.Router();
router.use(authMiddleware);

// 发帖图片上传（images 最多9张，走图片过滤器）
const postImagesUpload = uploadService.mixedUpload([{ name: 'images', maxCount: 9 }]);
// 创建圈子封面上传（单文件字段 cover）
const coverUpload = uploadService.singleUpload('cover');

// 帖子（静态路径必须在 /:id 之前注册，避免被通配吞掉）
router.post('/posts/:pid/like', cc.likePost);
router.post('/posts/:pid/comment', cc.commentPost);
router.post('/events/:eid/join', cc.joinEvent);
router.post('/events/:eid/leave', cc.leaveEvent);

router.post('/create', coverUpload, cc.createCommunity);
router.get('/list', cc.getList);
router.get('/:id', cc.getDetail);
router.post('/:id/join', cc.joinCommunity);
router.post('/:id/leave', cc.leaveCommunity);
router.get('/:id/members', cc.getMembers);
router.get('/:id/posts', cc.listPosts);
router.post('/:id/posts', postImagesUpload, cc.createPost);
router.get('/:id/events', cc.listEvents);
router.post('/:id/events', cc.createEvent);
module.exports = router;
