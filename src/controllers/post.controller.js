const Post = require('../models/Post');
const Checkin = require('../models/Checkin');
const { success, error, serverError } = require('../utils/response');
const { validateMagicBytes } = require('../services/upload.service');
const path = require('path');

async function createPost(req, res) {
  try {
    const { id } = req.user;
    const { content } = req.body;
    const images = [];

    const uploadedFiles = req.files && req.files.images ? req.files.images : [];

    if (!content && uploadedFiles.length === 0) {
      return error(res, 400, '请输入内容或添加图片');
    }

    for (const file of uploadedFiles) {
      const filePath = path.resolve(file.path);
      const isValid = await validateMagicBytes(filePath);
      if (isValid) {
        images.push(`/${file.filename}`);
      }
    }

    const post = await Post.create(id, { content, images });
    // 触发每日任务：发布动态
    Checkin.updateTaskProgress(id, 'post_moment').catch(() => {});
    success(res, post, '发布成功');
  } catch (err) {
    serverError(res, err, '发布动态失败');
  }
}

async function getPosts(req, res) {
  try {
    const { limit = 20, offset = 0, user_id } = req.query;
    const posts = await Post.getList({ limit, offset, user_id: user_id ? parseInt(user_id) : undefined });
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
    const { content } = req.body;

    if (!postId) return error(res, 400, '动态ID无效');
    if (!content || !content.trim()) return error(res, 400, '评论内容不能为空');

    const post = await Post.findById(postId);
    if (!post) return error(res, 404, '动态不存在');

    await Post.addComment(postId, id, content.trim());
    success(res, null, '评论成功');
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

module.exports = { createPost, getPosts, getPostDetail, addComment, toggleLike };
