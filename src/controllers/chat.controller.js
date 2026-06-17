/**
 * 聊天控制器
 * 处理聊天相关的HTTP请求，包括获取会话列表、消息列表、标记消息已读和获取未读消息数等功能
 */

const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const Checkin = require('../models/Checkin');
const { success, error, serverError } = require('../utils/response');

/**
 * 获取会话列表
 * @param {Object} req - Express请求对象
 * @param {Object} res - Express响应对象
 * @returns {Object} - 会话列表响应
 */
async function getConversations(req, res) {
  try {
    const { id } = req.user;
    const conversations = await Conversation.getUserConversations(id);
    success(res, conversations);
  } catch (err) {
    serverError(res, err, '获取会话列表失败');
  }
}

/**
 * 获取消息列表
 * @param {Object} req - Express请求对象
 * @param {Object} res - Express响应对象
 * @returns {Object} - 消息列表响应
 */
async function getMessages(req, res) {
  try {
    const { id } = req.user;
    const { conversation_id, limit = 20, offset = 0 } = req.query;

    if (!conversation_id) {
      return error(res, 400, '会话ID不能为空');
    }

    const conversation = await Conversation.findById(conversation_id);
    if (!conversation) {
      return error(res, 404, '会话不存在');
    }

    if (conversation.user1_id !== id && conversation.user2_id !== id) {
      return error(res, 403, '无权访问此会话');
    }

    const messages = await Message.getByConversationId(
      conversation_id,
      parseInt(limit),
      parseInt(offset)
    );

    await Message.markAllAsRead(conversation_id, id);

    success(res, messages);
  } catch (err) {
    serverError(res, err, '获取消息列表失败');
  }
}

/**
 * 标记消息为已读
 * @param {Object} req - Express请求对象
 * @param {Object} res - Express响应对象
 * @returns {Object} - 标记结果响应
 */
async function markAsRead(req, res) {
  try {
    const { id } = req.user;
    const { conversation_id } = req.body;

    if (!conversation_id) {
      return error(res, 400, '会话ID不能为空');
    }

    const conversation = await Conversation.findById(conversation_id);
    if (!conversation) {
      return error(res, 404, '会话不存在');
    }

    if (conversation.user1_id !== id && conversation.user2_id !== id) {
      return error(res, 403, '无权访问此会话');
    }

    const count = await Message.markAllAsRead(conversation_id, id);

    success(res, { count }, '标记已读成功');
  } catch (err) {
    serverError(res, err, '标记消息已读失败');
  }
}

/**
 * 获取未读消息数
 * @param {Object} req - Express请求对象
 * @param {Object} res - Express响应对象
 * @returns {Object} - 未读消息数响应
 */
async function getUnreadCount(req, res) {
  try {
    const { id } = req.user;
    const count = await Message.getUnreadCount(id);
    success(res, { count });
  } catch (err) {
    serverError(res, err, '获取未读消息数失败');
  }
}

/**
 * 创建或获取会话
 * @param {Object} req - Express请求对象
 * @param {Object} res - Express响应对象
 * @returns {Object} - 会话信息
 */
async function createConversation(req, res) {
  try {
    const { id } = req.user;
    const { other_user_id } = req.body;

    if (!other_user_id) {
      return error(res, 400, '目标用户ID不能为空');
    }
    if (id === other_user_id) {
      return error(res, 400, '不能与自己创建会话');
    }

    const conversation = await Conversation.createOrGet(id, other_user_id);

    // 触发每日任务：发起聊天
    Checkin.updateTaskProgress(id, 'chat_start').catch(() => {});

    success(res, conversation, '会话已就绪');
  } catch (err) {
    serverError(res, err, '创建会话失败');
  }
}

module.exports = {
  getConversations,
  getMessages,
  markAsRead,
  getUnreadCount,
  createConversation
};
