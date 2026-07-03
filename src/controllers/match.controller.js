/**
 * 匹配控制器
 * 处理用户匹配相关的HTTP请求，包括推荐用户、喜欢用户、跳过用户、获取匹配列表和解除匹配等功能
 */

const matchService = require('../services/match.service');
const Match = require('../models/Match');
const Like = require('../models/Like');
const antifraudService = require('../services/antifraud.service');
const Checkin = require('../models/Checkin');
const { success, error, serverError } = require('../utils/response');

/**
 * 推荐用户
 * @param {Object} req - Express请求对象
 * @param {Object} res - Express响应对象
 * @returns {Object} - 推荐用户列表响应
 */
async function recommendUsers(req, res) {
  try {
    const { id } = req.user;
    const { ageMin, ageMax, distance, limit, scope } = req.query;

    // scope 只接受 city 或 nearby，其他值降级为 city
    const validScope = scope === 'nearby' ? 'nearby' : 'city';

    const filters = {
      scope: validScope,
      ageMin: ageMin ? parseInt(ageMin) : 18,
      ageMax: ageMax ? parseInt(ageMax) : 35,
      distance: distance ? parseInt(distance) : 20,
      limit: limit ? parseInt(limit) : 20
    };

    const users = await matchService.recommendUsers(id, filters);
    success(res, users);
  } catch (err) {
    serverError(res, err, '推荐用户失败');
  }
}

/**
 * 喜欢用户
 * @param {Object} req - Express请求对象
 * @param {Object} res - Express响应对象
 * @returns {Object} - 喜欢结果响应
 */
async function likeUser(req, res) {
  try {
    const { id } = req.user;
    const { target_user_id } = req.body;

    if (!target_user_id) {
      return error(res, 400, '目标用户ID不能为空');
    }

    // 反欺诈：检查高频喜欢行为
    const likeRisk = await antifraudService.checkLikeBehavior(id);
    if (likeRisk.blocked) {
      return error(res, 429, '喜欢操作过于频繁，请稍后再试');
    }

    const result = await matchService.handleLike(id, target_user_id);

    if (!result.success) {
      return error(res, 400, result.message);
    }

    // 触发每日任务：喜欢用户
    Checkin.updateTaskProgress(id, 'like_users').catch(() => {});

    success(res, {
      matched: result.matched,
      match_id: result.match_id || null,
      conversation_id: result.conversation_id || null,
      partner: result.partner || null,
      common_tags: result.common_tags || [],
      icebreakers: result.icebreakers || []
    }, result.message);
  } catch (err) {
    serverError(res, err, '喜欢用户失败');
  }
}

/**
 * 跳过用户
 * @param {Object} req - Express请求对象
 * @param {Object} res - Express响应对象
 * @returns {Object} - 跳过结果响应
 */
async function skipUser(req, res) {
  try {
    const { id } = req.user;
    const { target_user_id } = req.body;

    if (!target_user_id) {
      return error(res, 400, '目标用户ID不能为空');
    }

    const result = await matchService.handleSkip(id, target_user_id);

    if (!result.success) {
      return error(res, 400, result.message);
    }

    success(res, null, result.message);
  } catch (err) {
    serverError(res, err, '跳过用户失败');
  }
}

/**
 * 获取匹配列表
 * @param {Object} req - Express请求对象
 * @param {Object} res - Express响应对象
 * @returns {Object} - 匹配列表响应
 */
async function getMatches(req, res) {
  try {
    const { id } = req.user;
    const { limit = 20, offset = 0 } = req.query;

    const matches = await Match.getUserMatches(id, parseInt(limit), parseInt(offset));
    success(res, matches);
  } catch (err) {
    serverError(res, err, '获取匹配列表失败');
  }
}

/**
 * 解除匹配
 * @param {Object} req - Express请求对象
 * @param {Object} res - Express响应对象
 * @returns {Object} - 解除匹配结果响应
 */
async function unmatch(req, res) {
  try {
    const { id } = req.user;
    const { target_user_id } = req.body;

    if (!target_user_id) {
      return error(res, 400, '目标用户ID不能为空');
    }

    const successResult = await Match.unmatch(id, target_user_id);

    if (!successResult) {
      return error(res, 400, '解除匹配失败');
    }

    success(res, null, '解除匹配成功');
  } catch (err) {
    serverError(res, err, '解除匹配失败');
  }
}

/**
 * 获取喜欢列表
 * @param {Object} req - Express请求对象
 * @param {Object} res - Express响应对象
 * @returns {Object} - 喜欢列表响应
 */
async function getLikes(req, res) {
  try {
    const { id } = req.user;
    const { limit = 20, offset = 0 } = req.query;

    const likes = await Like.getUserLikes(id, parseInt(limit), parseInt(offset));
    success(res, likes);
  } catch (err) {
    serverError(res, err, '获取喜欢列表失败');
  }
}

module.exports = {
  recommendUsers,
  likeUser,
  skipUser,
  getMatches,
  unmatch,
  getLikes
};
