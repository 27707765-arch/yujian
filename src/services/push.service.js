/**
 * 推送通知服务（模拟实现）
 * 用于向用户设备发送推送通知
 * 生产环境需对接 Firebase Cloud Messaging / 极光推送 / APNs
 */

const PushToken = require('../models/PushToken');

/**
 * 发送推送通知给指定用户
 * @param {number} userId - 用户ID
 * @param {Object} notification - 通知内容
 * @param {string} notification.title - 通知标题
 * @param {string} notification.body - 通知内容
 * @param {Object} notification.data - 附加数据
 * @returns {Promise<Object>}
 */
async function sendToUser(userId, notification) {
  try {
    const tokens = await PushToken.getByUserId(userId);
    if (tokens.length === 0) {
      console.log(`用户 ${userId} 无活跃设备Token，跳过推送`);
      return { success: false, reason: 'no_tokens' };
    }

    // 模拟推送发送
    for (const token of tokens) {
      console.log(`[推送模拟] → 用户${userId} (${token.platform}): ${notification.title} - ${notification.body}`);
    }

    return { success: true, sent: tokens.length };
  } catch (err) {
    console.error('推送通知发送失败:', err.message);
    return { success: false, reason: err.message };
  }
}

/**
 * 推送匹配成功通知
 * @param {number} userId - 接收通知的用户ID
 * @param {Object} matchInfo - 匹配信息
 */
async function notifyMatch(userId, matchInfo) {
  return sendToUser(userId, {
    title: '💕 匹配成功！',
    body: `你和 ${matchInfo.nickname || '一位用户'} 互生好感，快去聊天吧`,
    data: {
      type: 'match',
      match_id: matchInfo.match_id,
      other_user_id: matchInfo.other_user_id
    }
  });
}

/**
 * 推送新消息通知
 * @param {number} userId - 接收者ID
 * @param {Object} msgInfo - 消息信息
 */
async function notifyNewMessage(userId, msgInfo) {
  // 检查用户是否在线（WebSocket 连接中），在线则跳过推送
  const websocketService = require('./websocket.service');
  if (websocketService.isUserOnline(userId)) {
    return { success: true, reason: 'user_online' };
  }

  return sendToUser(userId, {
    title: msgInfo.sender_nickname || '新消息',
    body: msgInfo.content_preview || '你收到了一条新消息',
    data: {
      type: 'new_message',
      conversation_id: msgInfo.conversation_id,
      sender_id: msgInfo.sender_id
    }
  });
}

/**
 * 推送被喜欢通知
 * @param {number} userId - 被喜欢的用户ID
 * @param {Object} likeInfo - 喜欢信息
 */
async function notifyLike(userId, likeInfo) {
  return sendToUser(userId, {
    title: '❤️ 有人喜欢了你',
    body: '有人对你表示了喜欢，快去看看是谁',
    data: {
      type: 'like',
      liker_id: likeInfo.liker_id
    }
  });
}

/**
 * 推送被浏览通知
 * @param {number} userId - 被浏览的用户ID
 * @param {Object} viewInfo - 浏览信息
 */
async function notifyView(userId, viewInfo) {
  return sendToUser(userId, {
    title: '👀 有人查看了你的主页',
    body: `有${viewInfo.count || 1}人查看了你的主页`,
    data: {
      type: 'view',
      viewer_id: viewInfo.viewer_id
    }
  });
}

module.exports = {
  sendToUser,
  notifyMatch,
  notifyNewMessage,
  notifyLike,
  notifyView
};
