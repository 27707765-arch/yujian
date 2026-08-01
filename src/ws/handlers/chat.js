/**
 * WebSocket 聊天相关 handler（S19 从 websocket-server.js 拆分）
 * 包含：发送消息确认、输入状态、撤回、已读回执、在线状态广播
 * 依赖各自 require（不依赖主文件闭包），函数签名不变（userId, data）
 */

const Conversation = require('../../models/Conversation');
const websocketService = require('../../services/websocket.service');
const WsEvents = require('../../constants/wsEvents');

/**
 * 处理发送消息
 * 实现收敛：转调 chat.service.sendMessage（唯一实现，含审核/反欺诈/拉黑/WS推送/离线）
 * @param {number} userId - 发送者ID
 * @param {Object} data - 消息数据
 */
async function handleSendMessage(userId, data) {
  const chatService = require('../../services/chat.service');

  const result = await chatService.sendMessage({
    sender_id: userId,
    receiver_id: data.receiver_id,
    conversation_id: data.conversation_id,
    content: data.content,
    type: data.type,
    // 类型专属字段透传
    voice_url: data.voice_url,
    voice_duration: data.voice_duration,
    video_url: data.video_url,
    video_duration: data.video_duration,
    video_cover: data.video_cover,
    sticker_id: data.sticker_id,
    location_data: data.location_data,
    gift_data: data.gift_data
  });

  if (!result.success && result.blocked) {
    // 被拦截（审核/反欺诈/拉黑）：仅通知发送者
    websocketService.sendToUser(userId, {
      type: WsEvents.MESSAGE_BLOCKED,
      data: { receiver_id: result.receiver_id, reason: result.reason, timestamp: new Date().toISOString() }
    });
    return;
  }
  if (!result.success) {
    // 参数/业务错误
    websocketService.sendToUser(userId, {
      type: WsEvents.ERROR,
      data: { message: result.message }
    });
    return;
  }

  // 发送消息确认给发送者，包含送达状态
  websocketService.sendToUser(userId, {
    type: WsEvents.MESSAGE_SENT,
    data: {
      ...result.data,
      delivered: result.delivered,
      receiver_online: result.receiver_online
    }
  });
  console.log(`[WS] 用户${userId} -> 用户${result.data.receiver_id}: ${result.delivered ? '已送达' : '对方不在线，消息已存储'}`);
}

/**
 * 处理正在输入
 * @param {number} userId - 用户ID
 * @param {Object} data - 数据
 */
function handleTyping(userId, data) {
  const { receiver_id } = data;
  if (receiver_id) {
    websocketService.sendToUser(receiver_id, {
      type: WsEvents.TYPING,
      data: {
        user_id: userId
      }
    });
  }
}

/**
 * 处理停止输入
 * @param {number} userId - 用户ID
 * @param {Object} data - 数据
 */
function handleStopTyping(userId, data) {
  const { receiver_id } = data;
  if (receiver_id) {
    websocketService.sendToUser(receiver_id, {
      type: WsEvents.STOP_TYPING,
      data: { user_id: userId }
    });
  }
}

/**
 * 处理消息撤回（通过 WebSocket 实时撤回）
 * 客户端发送 { type: "recall_message", data: { message_id } }
 * 实现收敛：转调 chat.service.recallMessage（唯一实现，含 WS 推送双方）
 */
async function handleRecallMessage(userId, data) {
  const { message_id } = data;
  if (!message_id) return;

  const chatService = require('../../services/chat.service');
  const result = await chatService.recallMessage(message_id, userId);

  if (!result.success) {
    // 撤回失败，仅通知发起者
    websocketService.sendToUser(userId, {
      type: WsEvents.RECALL_FAILED,
      data: { message_id, reason: result.message }
    });
  }
}

/**
 * 处理已读回执
 * 客户端发送 { type: "read_receipt", data: { conversation_id, receiver_id } }
 */
function handleReadReceipt(userId, data) {
  const { conversation_id, receiver_id } = data;
  if (conversation_id) {
    // 通知会话对方已读
    const targetId = receiver_id || userId;
    websocketService.sendToUser(targetId, {
      type: WsEvents.READ_RECEIPT,
      data: { conversation_id, reader_id: userId, timestamp: new Date().toISOString() }
    });
  }
}

/**
 * 广播在线/离线状态给用户的所有会话对方
 * @param {number} userId - 状态变化的用户ID
 * @param {boolean} online - 是否上线
 */
async function broadcastOnlineStatus(userId, online) {
  try {
    const conversations = await Conversation.getUserConversations(userId);
    for (const conv of conversations) {
      const otherId = conv.user1_id === userId ? conv.user2_id : conv.user1_id;
      websocketService.sendToUser(otherId, {
        type: WsEvents.ONLINE_STATUS,
        data: { user_id: userId, online }
      });
    }
  } catch (err) {
    // 静默处理，不影响主流程
  }
}

module.exports = {
  handleSendMessage,
  handleTyping,
  handleStopTyping,
  handleRecallMessage,
  handleReadReceipt,
  broadcastOnlineStatus,
};
