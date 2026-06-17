/**
 * 拉黑控制器
 * 处理用户拉黑/取消拉黑/拉黑列表等HTTP请求
 */

const Block = require('../models/Block');
const Match = require('../models/Match');
const { success, error, serverError } = require('../utils/response');

/**
 * 拉黑用户
 * @param {Object} req - Express请求对象
 * @param {Object} res - Express响应对象
 */
async function blockUser(req, res) {
  try {
    const { id } = req.user;
    const { blocked_user_id, reason } = req.body;

    if (!blocked_user_id) {
      return error(res, 400, '被拉黑用户ID不能为空');
    }

    if (id === parseInt(blocked_user_id)) {
      return error(res, 400, '不能拉黑自己');
    }

    // 创建拉黑记录
    await Block.create(id, parseInt(blocked_user_id), reason || null);

    // 如果存在匹配关系，自动解除匹配
    try {
      await Match.unmatch(id, parseInt(blocked_user_id));
    } catch (matchErr) {
      // 忽略匹配解除失败（可能本就没有匹配）
    }

    success(res, null, '拉黑成功');
  } catch (err) {
    if (err.message.includes('已经拉黑')) {
      return error(res, 400, err.message);
    }
    serverError(res, err, '拉黑失败');
  }
}

/**
 * 取消拉黑
 * @param {Object} req - Express请求对象
 * @param {Object} res - Express响应对象
 */
async function unblockUser(req, res) {
  try {
    const { id } = req.user;
    const { blocked_user_id } = req.body;

    if (!blocked_user_id) {
      return error(res, 400, '被拉黑用户ID不能为空');
    }

    const result = await Block.delete(id, parseInt(blocked_user_id));

    if (!result) {
      return error(res, 404, '拉黑记录不存在');
    }

    success(res, null, '取消拉黑成功');
  } catch (err) {
    serverError(res, err, '取消拉黑失败');
  }
}

/**
 * 获取拉黑列表
 * @param {Object} req - Express请求对象
 * @param {Object} res - Express响应对象
 */
async function getBlockList(req, res) {
  try {
    const { id } = req.user;
    const { limit = 20, offset = 0 } = req.query;

    const list = await Block.getBlockList(id, parseInt(limit), parseInt(offset));
    success(res, list);
  } catch (err) {
    serverError(res, err, '获取拉黑列表失败');
  }
}

/**
 * 检查是否已拉黑某用户
 * @param {Object} req - Express请求对象
 * @param {Object} res - Express响应对象
 */
async function checkBlocked(req, res) {
  try {
    const { id } = req.user;
    const targetUserId = parseInt(req.query.user_id);

    if (!targetUserId) {
      return error(res, 400, '目标用户ID不能为空');
    }

    const isBlocked = await Block.isBlocked(id, targetUserId);
    success(res, { is_blocked: isBlocked });
  } catch (err) {
    serverError(res, err, '检查拉黑状态失败');
  }
}

module.exports = { blockUser, unblockUser, getBlockList, checkBlocked };
