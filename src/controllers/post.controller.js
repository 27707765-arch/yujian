const Post = require('../models/Post');
const Checkin = require('../models/Checkin');
const { success, error, serverError } = require('../utils/response');
const { validateMagicBytes } = require('../services/upload.service');
const path = require('path');

async function createPost(req, res) {
  try {
    const { id } = req.user;
    const { content, video_duration } = req.body;

    // 处理图片
    const images = [];
    const uploadedImages = req.files && req.files.images ? req.files.images : [];
    for (const file of uploadedImages) {
      const filePath = path.resolve(file.path);
      const isValid = await validateMagicBytes(filePath);
      if (isValid) {
        images.push(`/${file.filename}`);
      }
    }

    // 处理视频
    let video_url = null;
    let video_cover = null;
    const uploadedVideo = req.files && req.files.video ? req.files.video[0] : null;
    if (uploadedVideo) {
      video_url = `/${uploadedVideo.filename}`;
    }

    // 处理视频封面
    const uploadedCover = req.files && req.files.video_cover ? req.files.video_cover[0] : null;
    if (uploadedCover) {
      const filePath = path.resolve(uploadedCover.path);
      const isValid = await validateMagicBytes(filePath);
      if (isValid) {
        video_cover = `/${uploadedCover.filename}`;
      }
    }

    // 校验：内容和媒体不能同时为空
    const hasContent = content && content.trim();
    const hasImages = images.length > 0;
    const hasVideo = !!video_url;
    if (!hasContent && !hasImages && !hasVideo) {
      return error(res, 400, '请输入内容、添加图片或上传视频');
    }

    const post = await Post.create(id, {
      content,
      images,
      video_url,
      video_duration: video_duration ? parseInt(video_duration, 10) : null,
      video_cover
    });

    // 触发每日任务：发布动态
    Checkin.updateTaskProgress(id, 'post_moment').catch(() => {});
    success(res, post, '发布成功');
  } catch (err) {
    serverError(res, err, '发布动态失败');
  }
}

/**
 * 编辑动态（仅限本人）
 * PUT /api/posts/:id
 */
async function updatePost(req, res) {
  try {
    const { id } = req.user;
    const postId = parseInt(req.params.id, 10);
    if (isNaN(postId)) return error(res, 400, '动态ID无效');

    const { content } = req.body;

    // 处理图片更新（如果上传了新图片）
    const images = [];
    const uploadedImages = req.files && req.files.images ? req.files.images : [];
    for (const file of uploadedImages) {
      const filePath = path.resolve(file.path);
      const isValid = await validateMagicBytes(filePath);
      if (isValid) {
        images.push(`/${file.filename}`);
      }
    }

    const updated = await Post.update(postId, id, { content, images: images.length > 0 ? images : undefined });
    if (!updated) {
      return error(res, 404, '动态不存在或无权编辑');
    }

    success(res, updated, '编辑成功');
  } catch (err) {
    serverError(res, err, '编辑动态失败');
  }
}

/**
 * 删除动态（软删除，仅限本人）
 * DELETE /api/posts/:id
 */
async function deletePost(req, res) {
  try {
    const { id } = req.user;
    const postId = parseInt(req.params.id, 10);
    if (isNaN(postId)) return error(res, 400, '动态ID无效');

    const deleted = await Post.softDelete(postId, id);
    if (!deleted) {
      return error(res, 404, '动态不存在或无权删除');
    }

    success(res, null, '删除成功');
  } catch (err) {
    serverError(res, err, '删除动态失败');
  }
}

async function getPosts(req, res) {
  try {
    const { limit = 20, offset = 0, user_id, scope } = req.query;
    const currentUserId = req.user?.id;
    const posts = await Post.getList({ limit, offset, user_id: user_id ? parseInt(user_id) : undefined, scope, currentUserId });

    // 为每条动态附加当前用户的点赞状态
    if (currentUserId && posts.length > 0) {
      for (const post of posts) {
        post.is_liked = await Post.hasUserLiked(post.id, currentUserId);
      }
    }

    success(res, posts);
  } catch (err) {
    serverError(res, err, '获取动态失败');
  }
}

async function getPostDetail(req, res) {
  try {
    const postId = parseInt(req.params.id);
    if (!postId) return error(res, 400, '动态ID无效');

    const post = await Post.findById(postId);
    if (!post) return error(res, 404, '动态不存在');

    // 附加当前用户点赞状态
    if (req.user) {
      post.is_liked = await Post.hasUserLiked(postId, req.user.id);
    }

    const comments = await Post.getComments(postId);
    success(res, { post, comments });
  } catch (err) {
    serverError(res, err, '获取动态详情失败');
  }
}

async function addComment(req, res) {
  try {
    const { id } = req.user;
    const postId = parseInt(req.params.id);
    const { content, parent_id } = req.body;

    if (!postId) return error(res, 400, '动态ID无效');
    if (!content || !content.trim()) return error(res, 400, '评论内容不能为空');

    const post = await Post.findById(postId);
    if (!post) return error(res, 404, '动态不存在');

    await Post.addComment(postId, id, content.trim(), parent_id || null);
    success(res, null, parent_id ? '回复成功' : '评论成功');
  } catch (err) {
    serverError(res, err, '评论失败');
  }
}

/**
 * 点赞/取消点赞动态
 */
async function toggleLike(req, res) {
  try {
    const { id } = req.user;
    const postId = parseInt(req.params.id);
    if (!postId) return error(res, 400, '动态ID无效');

    const result = await Post.toggleLike(postId, id);
    success(res, result, result.message);
  } catch (err) {
    serverError(res, err, '点赞操作失败');
  }
}

/**
 * 查询当前用户对某动态的点赞状态
 */
async function checkLikeStatus(req, res) {
  try {
    const postId = parseInt(req.params.id);
    if (!postId) return error(res, 400, '动态ID无效');

    const liked = await Post.hasUserLiked(postId, req.user.id);
    success(res, { liked });
  } catch (err) {
    serverError(res, err, '查询点赞状态失败');
  }
}

/**
 * 点赞/取消评论
 * POST /api/comments/:id/like
 */
async function toggleCommentLike(req, res) {
  try {
    const { id: userId } = req.user;
    const commentId = parseInt(req.params.id, 10);
    if (!commentId || isNaN(commentId)) return error(res, 400, '评论ID无效');
    const result = await Post.toggleCommentLike(commentId, userId);
    success(res, result, result.liked ? '点赞成功' : '取消点赞');
  } catch (err) {
    serverError(res, err, '点赞评论失败');
  }
}

module.exports = { createPost, getPosts, getPostDetail, addComment, toggleLike, toggleCommentLike, checkLikeStatus, updatePost, deletePost };
