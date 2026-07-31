/**
 * 聊天服务（唯一实现）
 * 统一 HTTP(chat.controller) 与 WebSocket(websocket-server) 两条发送/撤回路径，
 * 消除同构重复代码。包含：msgType 2/3/4/5/6 分支、Message.create、
 * WS 实时推送、delivered/offline 判断、内容审核、反欺诈、拉黑检测。
 */

const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const Block = require('../models/Block');
const websocketService = require('./websocket.service');
const contentAuditService = require('./contentAudit.service');
const antifraudService = require('./antifraud.service');
const offlineMessageService = require('./offlineMessage.service');

/**
 * 构建消息对象（含发送者昵称/头像，供 WS 推送与前端展示）
 */
function buildMessageObj(msg) {
  return {
    type: 'message',
    data: {
      id: msg.id,
      conversation_id: msg.conversation_id,
      sender_id: msg.sender_id,
      sender_nickname: msg.sender_nickname || null,
      sender_avatar: msg.sender_avatar || null,
      receiver_id: msg.receiver_id,
      content: msg.content,
      type: msg.type,
      status: msg.status,
      created_at: msg.created_at,
      voice_url: msg.voice_url,
      voice_duration: msg.voice_duration,
      video_url: msg.video_url,
      video_duration: msg.video_duration,
      video_cover: msg.video_cover,
      sticker_id: msg.sticker_id,
      location_data: msg.location_data,
      gift_data: msg.gift_data
    }
  };
}

/**
 * 发送消息（HTTP 与 WS 唯一实现）
 * @param {Object} params
 * @param {number} params.sender_id - 发送者用户ID
 * @param {number} [params.receiver_id] - 接收者用户ID（无 conversation_id 时使用）
 * @param {number} [params.conversation_id] - 会话ID（优先）
 * @param {string} [params.content] - 文本内容
 * @param {number} [params.type] - 消息类型 0文本 1图片 2语音 3视频 4贴纸 5位置 6礼物
 * @param {Object} [params.extra] - 类型专属字段（voice_url/video_url/sticker_id/location_data/gift_data 等）
 * @returns {Promise<Object>}
 *   - { success:false, message } 参数/业务错误
 *   - { success:false, blocked:true, reason } 被拦截（审核/反欺诈/拉黑）
 *   - { success:true, message, delivered, receiver_online } 成功
 */
async function sendMessage({ sender_id, receiver_id, conversation_id, content, type, ...extra }) {
  const msgType = parseInt(type) || 0;

  // 1. 确定接收者与会话
  let receiverId = receiver_id;
  if (!conversation_id && !receiver_id) {
    return { success: false, message: '会话ID或接收者ID不能为空' };
  }
  if (conversation_id) {
    try {
      const conv = await Conversation.findById(conversation_id);
      if (!conv) return { success: false, message: '会话不存在' };
      if (conv.user1_id !== sender_id && conv.user2_id !== sender_id) {
        return { success: false, message: '无权访问此会话' };
      }
      receiverId = conv.user1_id === sender_id ? conv.user2_id : conv.user1_id;
    } catch (e) {
      return { success: false, message: '会话查询失败' };
    }
  }
  if (!receiverId) return { success: false, message: '接收者ID不能为空' };

  // 2. 校验发送者存在
  try {
    const User = require('../models/User');
    const sender = await User.findById(sender_id);
    if (!sender) return { success: false, message: '用户不存在，请重新登录' };
  } catch (e) { /* 校验失败不阻塞 */ }

  // 3. 内容非空校验（非文字/系统消息时 content 可为空）
  if (msgType <= 1 && !content) return { success: false, message: '消息内容不能为空' };

  let filteredContent = content || '';

  // 4. 内容审核 + 反欺诈（仅对文字消息执行）
  if (msgType <= 1 && content) {
    const auditResult = contentAuditService.checkSensitiveContent(content);
    if (!auditResult.pass) {
      return { success: false, blocked: true, reason: auditResult.message, receiver_id: receiverId };
    }
    filteredContent = contentAuditService.filterSensitiveContent(content);

    const msgRiskCheck = await antifraudService.checkMessageBehavior(sender_id, filteredContent);
    if (msgRiskCheck.blocked) {
      return { success: false, blocked: true, reason: '消息发送异常，已被系统拦截', receiver_id: receiverId };
    }
  }

  // 5. 拉黑检测（双向）
  const isMutualBlocked = await Block.isMutualBlocked(sender_id, receiverId);
  if (isMutualBlocked) {
    return { success: false, blocked: true, reason: '无法发送消息，存在拉黑关系', receiver_id: receiverId };
  }

  // 6. 创建/获取会话
  let conv;
  try {
    conv = conversation_id
      ? await Conversation.findById(conversation_id)
      : await Conversation.createOrGet(sender_id, receiverId);
  } catch (e) {
    return { success: false, message: '会话创建失败' };
  }
  if (!conv) return { success: false, message: '会话不存在' };
  const finalConvId = conv.id;

  // 7. 构建消息数据（支持多类型）
  const msgData = {
    conversation_id: finalConvId,
    sender_id,
    receiver_id: receiverId,
    content: filteredContent,
    type: msgType
  };
  if (msgType === 2) {
    msgData.voice_url = extra.voice_url || null;
    msgData.voice_duration = parseInt(extra.voice_duration) || 0;
  }
  if (msgType === 3) {
    msgData.video_url = extra.video_url || null;
    msgData.video_duration = parseInt(extra.video_duration) || 0;
    msgData.video_cover = extra.video_cover || null;
  }
  if (msgType === 4) msgData.sticker_id = parseInt(extra.sticker_id) || null;
  if (msgType === 5) msgData.location_data = extra.location_data || null;
  if (msgType === 6) msgData.gift_data = extra.gift_data || null;

  // 8. 落库
  let message;
  try {
    message = await Message.create(msgData);
  } catch (e) {
    return { success: false, message: '消息存储失败' };
  }

  // 9. WS 实时推送 + delivered/offline 判断
  const messageObj = buildMessageObj(message);
  const sent = websocketService.sendToUser(receiverId, messageObj);

  // 10. 离线存储
  if (!sent) {
    offlineMessageService.storeMessage(receiverId, messageObj).catch(err => {
      console.error('[Chat] 存储离线消息失败:', err.message);
    });
  }

  // 11. 记录亲密度（异步）
  try {
    const intimacyService = require('./intimacy.service');
    intimacyService.onChatMessage(sender_id, receiverId).catch(() => {});
  } catch (e) { /* 忽略 */ }

  return {
    success: true,
    message: sent ? '发送成功' : '发送成功（对方不在线，上线后可收到）',
    delivered: sent,
    receiver_online: websocketService.isUserOnline(receiverId),
    data: { ...message, delivered: sent, receiver_online: websocketService.isUserOnline(receiverId) }
  };
}

/**
 * 撤回消息（HTTP 与 WS 唯一实现，2分钟内有效）
 * 内部完成：归属校验/时效校验/防重复 + WS 向双方推送撤回事件
 * @param {number} messageId - 消息ID
 * @param {number} senderId - 发起撤回的用户ID（必须是发送者）
 * @returns {Promise<Object>} { success, data?|message }
 */
async function recallMessage(messageId, senderId) {
  const result = await Message.recall(messageId, senderId);
  if (!result.success) {
    return { success: false, message: result.message };
  }

  const { data } = result;
  const payload = {
    type: 'message_recalled',
    data: {
      message_id: data.id,
      conversation_id: data.conversation_id,
      sender_id: data.sender_id,
      recalled_at: new Date().toISOString()
    }
  };

  // 通知接收者 + 告知发送者（多设备同步）
  if (data.receiver_id) {
    websocketService.sendToUser(data.receiver_id, payload);
  }
  websocketService.sendToUser(senderId, payload);

  return { success: true, data };
}

module.exports = { sendMessage, recallMessage, buildMessageObj };
