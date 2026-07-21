/**
 * 聊天控制器
 * 处理聊天相关的HTTP请求，包括获取会话列表、消息列表、标记消息已读和获取未读消息数等功能
 */

const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const Checkin = require('../models/Checkin');
const { success, error, serverError } = require('../utils/response');
const websocketService = require('../services/websocket.service');

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

/**
 * 撤回消息（发送后2分钟内有效）
 * POST /api/chat/messages/:id/recall
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

    // 调用模型执行撤回（含归属校验、时效校验、防重复）
    const result = await Message.recall(messageId, id);

    if (!result.success) {
      // 业务级失败：消息不存在、非本人、超时、已撤回
      return error(res, 400, result.message);
    }

    // 通过 WebSocket 向接收者推送撤回事件
    const { data } = result;
    websocketService.sendToUser(data.receiver_id, {
      type: 'message_recalled',
      data: {
        message_id: data.id,
        conversation_id: data.conversation_id,
        sender_id: data.sender_id,
        recalled_at: new Date().toISOString()
      }
    });

    // 同时告知发送者撤回成功（多设备同步）
    websocketService.sendToUser(id, {
      type: 'message_recalled',
      data: {
        message_id: data.id,
        conversation_id: data.conversation_id,
        sender_id: data.sender_id,
        recalled_at: new Date().toISOString()
      }
    });

    success(res, data, '消息已撤回');
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
 */
async function sendMessage(req, res) {
  try {
    const { id } = req.user;
    const { conversation_id, content, type } = req.body;
    if (!conversation_id) return error(res, 400, '会话ID不能为空');
    if (!content) return error(res, 400, '消息内容不能为空');
    const msgType = parseInt(type) || 0;
    // 获取会话信息以确定接收者
    const conv = await Conversation.findById(conversation_id);
    if (!conv) return error(res, 404, '会话不存在');
    const receiverId = conv.user1_id === id ? conv.user2_id : conv.user1_id;
    const msg = await Message.create({
      conversation_id,
      sender_id: id,
      receiver_id: receiverId,
      content,
      type: msgType
    });
    // WebSocket推送
    websocketService.sendToUser(receiverId, { type: 'message', data: msg });
    success(res, msg, '发送成功');
  } catch (err) {
    serverError(res, err, '发送消息失败');
  }
}

module.exports = {
  getConversations,
  getMessages,
  markAsRead,
  getUnreadCount,
  createConversation,
  recallMessage,
  deleteConversation,
  pinConversation,
  sendMessage
};
