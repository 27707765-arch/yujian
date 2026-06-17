/**
 * 用户路由
 * 处理用户相关的API端点，包括用户信息、相册、隐私设置和兴趣标签
 * 所有路由都需要认证
 */

const express = require('express');
const userController = require('../controllers/user.controller');
const authMiddleware = require('../middleware/auth');
const uploadService = require('../services/upload.service');

const router = express.Router();

// 所有路由都需要认证
router.use(authMiddleware);

// ==================== 用户信息 ====================

// 获取用户信息
router.get('/info', userController.getUserInfo);

// 更新用户信息（含标签）
router.put('/info', userController.updateUserInfo);

// 上传头像
router.post('/avatar', uploadService.singleUpload('avatar'), userController.uploadAvatar);

// 获取其他用户资料
router.get('/profile/:id', userController.getUserProfile);

// ==================== 相册管理 ====================

// 获取用户相册（自己的或指定用户的）
router.get('/photos', userController.getPhotos);
router.get('/photos/:userId', userController.getPhotos);

// 上传照片到相册
router.post('/photos', uploadService.singleUpload('photo'), userController.uploadPhoto);

// 设置封面照片
router.put('/photos/:photoId/cover', userController.setCoverPhoto);

// 删除照片
router.delete('/photos/:photoId', userController.deletePhoto);

// ==================== 隐私设置 ====================

// 获取隐私设置
router.get('/settings', userController.getSettings);

// 更新隐私设置
router.put('/settings', userController.updateSettings);

// ==================== 兴趣标签 ====================

// VIP信息
router.get('/vip-info', async (req, res) => {
  const vipService = require('../services/vip.service');
  try {
    const info = await vipService.getVipInfo(req.user.id);
    require('../utils/response').success(res, info);
  } catch (err) {
    require('../utils/response').serverError(res, err, '获取VIP信息失败');
  }
});

// 获取所有可用标签
router.get('/tags', userController.getAllTags);

// ==================== 用户搜索 ====================

// 搜索用户
router.get('/search', userController.searchUsers);

// ==================== 社交关系 ====================

// 获取粉丝列表
router.get('/fans', userController.getFans);

// 获取关注列表
router.get('/following', userController.getFollowing);

// 获取看过我的人
router.get('/viewers', userController.getViewers);

module.exports = router;
