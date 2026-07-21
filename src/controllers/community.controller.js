/**
 * 圈子控制器
 */
const Community = require('../models/Community');
const { success, error, serverError } = require('../utils/response');

async function createCommunity(req, res) {
  try {
    const { id } = req.user;
    const { name, description, cover_url, tags, join_type } = req.body;
    if (!name || name.length < 2) return error(res, 400, '圈子名称至少2个字');
    const c = await Community.create({ name, description, cover_url, tags, join_type, creator_id: id });
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

module.exports = { createCommunity, getList, getDetail, joinCommunity, leaveCommunity, getMembers };
