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
    const { conversation_id, limit = 20, offset = 0, before } = req.query;

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
      parseInt(offset),
      before ? parseInt(before) : null
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

/**
 * 撤回消息（发送后2分钟内有效）
 * POST /api/chat/messages/:id/recall
 * 实现收敛：转调 chat.service.recallMessage（唯一实现，含 WS 推送）
 * @param {Object} req - Express请求对象
 * @param {Object} res - Express响应对象
 */
async function recallMessage(req, res) {
  try {
    const { id } = req.user;
    const messageId = parseInt(req.params.id, 10);

    if (isNaN(messageId) || messageId <= 0) {
      return error(res, 400, '消息ID无效');
    }

    const chatService = require('../services/chat.service');
    const result = await chatService.recallMessage(messageId, id);

    if (!result.success) {
      return error(res, 400, result.message);
    }

    success(res, result.data, '消息已撤回');
  } catch (err) {
    serverError(res, err, '撤回消息失败');
  }
}

/**
 * 删除会话
 * DELETE /api/chat/conversations/:id
 */
async function deleteConversation(req, res) {
  try {
    const { id } = req.user;
    const convId = parseInt(req.params.id, 10);
    if (isNaN(convId) || convId <= 0) return error(res, 400, '会话ID无效');
    await Conversation.softDelete(convId, id);
    success(res, null, '会话已删除');
  } catch (err) {
    serverError(res, err, '删除会话失败');
  }
}

/**
 * 批量删除会话
 * POST /api/chat/conversations/batch-delete
 * body: { conversation_ids: [1,2,3] }
 */
async function batchDeleteConversations(req, res) {
  try {
    const { id } = req.user;
    const { conversation_ids } = req.body || {};
    const ids = (Array.isArray(conversation_ids) ? conversation_ids : [])
      .map(Number).filter((n) => Number.isInteger(n) && n > 0);
    if (ids.length === 0) return error(res, 400, '请选择要删除的会话');
    const count = await Conversation.batchSoftDelete(ids, id);
    if (count === 0) return error(res, 404, '没有可删除的会话');
    success(res, { count }, `已删除 ${count} 个会话`);
  } catch (err) {
    serverError(res, err, '批量删除会话失败');
  }
}

/**
 * 置顶会话
 * PUT /api/chat/conversations/:id/pin
 */
async function pinConversation(req, res) {
  try {
    const { id } = req.user;
    const convId = parseInt(req.params.id, 10);
    if (isNaN(convId) || convId <= 0) return error(res, 400, '会话ID无效');
    await Conversation.togglePin(convId, id);
    success(res, null, '操作成功');
  } catch (err) {
    serverError(res, err, '置顶会话失败');
  }
}

/**
 * 发送消息（HTTP回退）
 * POST /api/chat/messages
 * 实现收敛：转调 chat.service.sendMessage（唯一实现，含审核/反欺诈/拉黑/WS推送/离线）
 */
async function sendMessage(req, res) {
  try {
    const { id } = req.user;
    const { conversation_id, content, type } = req.body;

    const chatService = require('../services/chat.service');
    const result = await chatService.sendMessage({
      sender_id: id,
      conversation_id,
      content,
      type,
      // 类型专属字段透传
      voice_url: req.body.voice_url,
      voice_duration: req.body.voice_duration,
      video_url: req.body.video_url,
      video_duration: req.body.video_duration,
      video_cover: req.body.video_cover,
      sticker_id: req.body.sticker_id,
      location_data: req.body.location_data,
      gift_data: req.body.gift_data
    });

    // 参数/业务错误
    if (!result.success && !result.blocked) {
      return error(res, 400, result.message);
    }
    // 被拦截（审核/反欺诈/拉黑）
    if (result.blocked) {
      return error(res, 400, result.reason);
    }

    success(res, result.data, result.message);
  } catch (err) {
    serverError(res, err, '发送消息失败');
  }
}

// ====== 快捷回复 ======
async function getQuickReplies(req, res) {
  try {
    const ChatEnhance = require('../models/ChatEnhance');
    success(res, await ChatEnhance.getQuickReplies(req.user.id));
  } catch (err) { serverError(res, err, '获取快捷回复失败'); }
}
async function addQuickReply(req, res) {
  try {
    const ChatEnhance = require('../models/ChatEnhance');
    const r = await ChatEnhance.addQuickReply(req.user.id, req.body.content);
    if (!r) return error(res, 400, '添加失败');
    success(res, r, '添加成功');
  } catch (err) { serverError(res, err, '添加快捷回复失败'); }
}
async function deleteQuickReply(req, res) {
  try {
    const ChatEnhance = require('../models/ChatEnhance');
    await ChatEnhance.deleteQuickReply(parseInt(req.params.id), req.user.id);
    success(res, null, '删除成功');
  } catch (err) { serverError(res, err, '删除快捷回复失败'); }
}

// ====== 聊天背景 ======
async function setBackground(req, res) {
  try {
    const { id } = req.user;
    const convId = parseInt(req.params.id);
    const ChatEnhance = require('../models/ChatEnhance');
    await ChatEnhance.setBackground(id, convId, req.body.background_url);
    success(res, null, '背景设置成功');
  } catch (err) { serverError(res, err, '设置背景失败'); }
}
async function getBackground(req, res) {
  try {
    const { id } = req.user;
    const convId = parseInt(req.params.id);
    const ChatEnhance = require('../models/ChatEnhance');
    const bg = await ChatEnhance.getBackground(id, convId);
    success(res, bg);
  } catch (err) { serverError(res, err, '获取背景失败'); }
}

// ====== 消息搜索 ======
async function searchMessages(req, res) {
  try {
    const { id } = req.user;
    const { keyword, conversation_id } = req.query;
    if (!keyword) return error(res, 400, '搜索关键词不能为空');
    const ChatEnhance = require('../models/ChatEnhance');
    const msgs = await ChatEnhance.searchMessages(id, keyword, conversation_id ? parseInt(conversation_id) : null);
    success(res, msgs);
  } catch (err) { serverError(res, err, '搜索消息失败'); }
}

module.exports = {
  getConversations, getMessages, markAsRead, getUnreadCount,
  createConversation, recallMessage, deleteConversation, batchDeleteConversations,
  pinConversation, sendMessage,
  getQuickReplies, addQuickReply, deleteQuickReply,
  setBackground, getBackground, searchMessages
};


