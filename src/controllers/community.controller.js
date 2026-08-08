/**
 * 圈子控制器
 */
const Community = require('../models/Community');
const CommunityPost = require('../models/CommunityPost');
const CommunityEvent = require('../models/CommunityEvent');
const { executeQuery } = require('../utils/database');
const { success, error, serverError } = require('../utils/response');

/** 校验用户是否为圈子成员 */
async function isMember(communityId, userId) {
  try {
    const [rows] = await executeQuery('SELECT 1 FROM community_members WHERE community_id = ? AND user_id = ?', [communityId, userId]);
    return !!rows[0];
  } catch (e) { return false; }
}

async function createCommunity(req, res) {
  try {
    const { id } = req.user;
    const { name, description, tags, join_type } = req.body;
    if (!name || name.length < 2) return error(res, 400, '圈子名称至少2个字');
    // tags 兼容两种来源：JSON 字符串（multipart）或数组（JSON body）
    let tagsArr = tags;
    if (typeof tags === 'string') {
      try { tagsArr = JSON.parse(tags); } catch (e) { tagsArr = tags.split(/[,，\s]+/).filter(Boolean); }
    }
    let cover_url = req.body.cover_url || null;
    // 有封面上传文件时优先使用文件（已通过 cover 单图过滤器）
    if (req.file) cover_url = '/uploads/' + req.file.filename;
    const c = await Community.create({ name, description, cover_url, tags: tagsArr, join_type, creator_id: id });
    // 创建者自动加入
    await Community.join(c.id, id);
    success(res, c, '圈子创建成功');
  } catch (err) { serverError(res, err, '创建圈子失败'); }
}

async function getList(req, res) {
  try {
    const { limit, offset, sort } = req.query;
    const list = await Community.getList({ limit: parseInt(limit)||20, offset: parseInt(offset)||0, sort });
    success(res, list);
  } catch (err) { serverError(res, err, '获取圈子列表失败'); }
}

async function getDetail(req, res) {
  try {
    const c = await Community.findById(parseInt(req.params.id));
    if (!c) return error(res, 404, '圈子不存在');
    success(res, c);
  } catch (err) { serverError(res, err, '获取圈子详情失败'); }
}

async function joinCommunity(req, res) {
  try {
    const { id } = req.user;
    await Community.join(parseInt(req.params.id), id);
    success(res, null, '加入成功');
  } catch (err) { serverError(res, err, '加入圈子失败'); }
}

async function leaveCommunity(req, res) {
  try {
    const { id } = req.user;
    await Community.leave(parseInt(req.params.id), id);
    success(res, null, '退出成功');
  } catch (err) { serverError(res, err, '退出圈子失败'); }
}

async function getMembers(req, res) {
  try {
    const members = await Community.getMembers(parseInt(req.params.id));
    success(res, members);
  } catch (err) { serverError(res, err, '获取成员列表失败'); }
}

// ===== 圈子帖子 =====
async function createPost(req, res) {
  try {
    const { id } = req.user;
    const communityId = parseInt(req.params.id);
    const content = req.body.content || '';
    if (!content.trim()) return error(res, 400, '内容不能为空');
    if (!await isMember(communityId, id)) return error(res, 403, '请先加入圈子再发帖');

    // 处理多图上传（magic byte 校验，拼 /uploads/ 前缀）
    const { validateMagicBytes } = require('../services/upload.service');
    const path = require('path');
    const images = [];
    const uploadedImages = req.files && req.files.images ? req.files.images : [];
    for (const file of uploadedImages) {
      const filePath = path.resolve(file.path);
      if (await validateMagicBytes(filePath)) {
        images.push('/uploads/' + file.filename);
      }
    }

    const post = await CommunityPost.create(communityId, id, content.trim(), images);
    success(res, post, '发布成功');
  } catch (err) { serverError(res, err, '发布帖子失败'); }
}

async function listPosts(req, res) {
  try {
    const { limit, offset } = req.query;
    const posts = await CommunityPost.getByCommunity(parseInt(req.params.id), {
      limit: parseInt(limit) || 20, offset: parseInt(offset) || 0
    });
    success(res, posts);
  } catch (err) { serverError(res, err, '获取帖子失败'); }
}

async function likePost(req, res) {
  try {
    await CommunityPost.toggleLike(parseInt(req.params.pid));
    success(res, null, '点赞成功');
  } catch (err) { serverError(res, err, '点赞失败'); }
}

async function commentPost(req, res) {
  try {
    const post = await CommunityPost.getDetail(parseInt(req.params.pid));
    if (!post) return error(res, 404, '帖子不存在');
    await CommunityPost.addComment(post.id);
    success(res, null, '评论成功');
  } catch (err) { serverError(res, err, '评论失败'); }
}

// ===== 圈子事件 =====
async function createEvent(req, res) {
  try {
    const { id } = req.user;
    const communityId = parseInt(req.params.id);
    const { title, description, location, start_time, max_participants } = req.body;
    if (!title || !title.trim()) return error(res, 400, '事件标题不能为空');
    if (!start_time) return error(res, 400, '请选择开始时间');
    if (!await isMember(communityId, id)) return error(res, 403, '请先加入圈子再创建事件');
    const event = await CommunityEvent.create(communityId, id, { title: title.trim(), description, location, start_time, max_participants });
    success(res, event, '事件创建成功');
  } catch (err) { serverError(res, err, '创建事件失败'); }
}

async function listEvents(req, res) {
  try {
    const events = await CommunityEvent.getByCommunity(parseInt(req.params.id));
    success(res, events);
  } catch (err) { serverError(res, err, '获取事件失败'); }
}

async function joinEvent(req, res) {
  try {
    const event = await CommunityEvent.getDetail(parseInt(req.params.eid));
    if (!event) return error(res, 404, '事件不存在');
    if (event.max_participants && event.participant_count >= event.max_participants) {
      return error(res, 400, '报名人数已满');
    }
    await CommunityEvent.join(event.id);
    success(res, null, '报名成功');
  } catch (err) { serverError(res, err, '报名失败'); }
}

async function leaveEvent(req, res) {
  try {
    await CommunityEvent.leave(parseInt(req.params.eid));
    success(res, null, '已取消报名');
  } catch (err) { serverError(res, err, '取消报名失败'); }
}

module.exports = { createCommunity, getList, getDetail, joinCommunity, leaveCommunity, getMembers, createPost, listPosts, likePost, commentPost, createEvent, listEvents, joinEvent, leaveEvent };
