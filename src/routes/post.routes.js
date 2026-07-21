const express = require('express');
const postController = require('../controllers/post.controller');
const authMiddleware = require('../middleware/auth');
const contentAudit = require('../middleware/contentAudit');
const uploadService = require('../services/upload.service');

const router = express.Router();
router.use(authMiddleware);

// 混合上传：图片（最多9张）+ 视频（最多1个）+ 封面（最多1张）
const mediaUpload = uploadService.mediaUpload([
  { name: 'images', maxCount: 9 },
  { name: 'video', maxCount: 1 },
  { name: 'video_cover', maxCount: 1 }
]);

// 创建动态（支持图片和视频）
router.post('/', mediaUpload, contentAudit({ fields: ['content'] }), postController.createPost);

// 获取动态列表
router.get('/', postController.getPosts);

// 编辑动态
router.put('/:id', mediaUpload, contentAudit({ fields: ['content'] }), postController.updatePost);

// 删除动态（软删除）
router.delete('/:id', postController.deletePost);

// 获取点赞状态
router.get('/:id/like', postController.checkLikeStatus);

// 获取动态详情
router.get('/:id', postController.getPostDetail);

// 评论动态
router.post('/:id/comment', contentAudit({ fields: ['content'] }), postController.addComment);

// 点赞/取消点赞
router.post('/:id/like', postController.toggleLike);

// 点赞评论
router.post('/comments/:id/like', postController.toggleCommentLike);

// 收藏/取消收藏
router.post('/:id/favorite', postController.toggleFavorite);

// 我的收藏
router.get('/favorites', postController.getFavorites);

// 转发动态
router.post('/:id/repost', contentAudit({ fields: ['repost_comment'] }), postController.createRepost);

module.exports = router;