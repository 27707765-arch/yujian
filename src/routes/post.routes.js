const express = require('express');
const postController = require('../controllers/post.controller');
const authMiddleware = require('../middleware/auth');
const contentAudit = require('../middleware/contentAudit');
const uploadService = require('../services/upload.service');

const router = express.Router();
router.use(authMiddleware);

const upload = uploadService.multipleUpload([{ name: 'images', maxCount: 9 }]);

// multer 必须在 contentAudit 之前，否则 req.body 为空
router.post('/', upload, contentAudit({ fields: ['content'] }), postController.createPost);
router.get('/', postController.getPosts);
router.get('/:id', postController.getPostDetail);
router.post('/:id/comment', contentAudit({ fields: ['content'] }), postController.addComment);
router.post('/:id/like', postController.toggleLike);

module.exports = router;
