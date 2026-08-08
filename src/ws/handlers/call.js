/**
 * WebSocket 通话信令 handler（S19 从 websocket-server.js 拆分）
 * 包含：呼叫请求/接受/拒绝/结束/ICE候选
 * 依赖各自 require（不依赖主文件闭包），函数签名不变（userId, data）
 */

const Block = require('../../models/Block');
const callService = require('../../services/call.service');
const websocketService = require('../../services/websocket.service');
const WsEvents = require('../../constants/wsEvents');

/**
 * 发起通话请求（voice/video）
 * 增强版：创建通话记录 + 生成Agora Token
 * @param {number} userId - 发起方用户ID
 * @param {Object} data - { receiver_id, call_type }
 */
async function handleCallRequest(userId, data) {
  const { receiver_id, call_type = 'voice' } = data;
  if (!receiver_id) return;

  // 1. 拉黑检测
  const blocked = await Block.isMutualBlocked(userId, receiver_id);
  if (blocked) {
    websocketService.sendToUser(userId, {
      type: WsEvents.CALL_BLOCKED,
      data: { receiver_id, reason: '无法发起通话，存在拉黑关系' }
    });
    return;
  }

  // 2. 检查对方是否在线
  const isOnline = websocketService.isUserOnline(receiver_id);
  if (!isOnline) {
    websocketService.sendToUser(userId, {
      type: WsEvents.CALL_USER_OFFLINE,
      data: { receiver_id, message: '对方不在线' }
    });
    return;
  }

  // 3. 创建通话记录 + 生成Token
  let callRecord = null;
  try {
    callRecord = await callService.initiateCall(userId, receiver_id, call_type);
  } catch (err) {
    websocketService.sendToUser(userId, {
      type: WsEvents.CALL_ERROR,
      data: { receiver_id, message: err.message }
    });
    return;
  }

  // 4. 转发呼叫请求（携带Token和记录ID + WebRTC offer）
  websocketService.sendToUser(receiver_id, {
    type: WsEvents.CALL_REQUEST,
    data: {
      caller_id: userId,
      call_type,
      call_id: callRecord.call_id,
      channel_name: callRecord.channel_name,
      agora_token: callRecord.token,
      simulate: callRecord.simulate,
      offer: data.offer || null,
      timestamp: new Date().toISOString()
    }
  });

  // 5. 给发起方确认（带call_id和token）
  websocketService.sendToUser(userId, {
    type: WsEvents.CALL_INITIATED,
    data: {
      receiver_id,
      call_id: callRecord.call_id,
      channel_name: callRecord.channel_name,
      agora_token: callRecord.token,
      simulate: callRecord.simulate
    }
  });
}

/**
 * 接受通话
 * @param {number} userId - 接听方用户ID
 * @param {Object} data - { caller_id, call_id, channel_name }
 */
async function handleCallAccept(userId, data) {
  const { caller_id, call_id } = data;
  if (!caller_id) return;

  // 如果有call_id，更新通话记录为connected
  if (call_id) {
    try {
      await callService.acceptCall(call_id, userId);
    } catch (err) {
      console.error('更新通话记录失败:', err.message);
    }
  }

  // 给接听方生成Token
  const channelName = data.channel_name;
  const token = channelName ? callService.generateToken(channelName, userId) : null;

  websocketService.sendToUser(caller_id, {
    type: WsEvents.CALL_ACCEPTED,
    data: {
      receiver_id: userId,
      call_id,
      channel_name: channelName,
      agora_token: token,
      sdp: data.sdp || null
    }
  });
}

/**
 * 拒绝通话
 * @param {number} userId - 拒绝方用户ID
 * @param {Object} data - { caller_id, reason, call_id }
 */
async function handleCallReject(userId, data) {
  const { caller_id, reason, call_id } = data;
  if (!caller_id) return;

  // 更新通话记录状态
  if (call_id) {
    try {
      await callService.rejectCall(call_id, userId, caller_id);
    } catch (err) {
      console.error('更新通话拒绝记录失败:', err.message);
    }
  }

  websocketService.sendToUser(caller_id, {
    type: WsEvents.CALL_REJECTED, data: { receiver_id: userId, reason: reason || '对方拒绝了通话' }
  });
}

/**
 * 结束通话
 * @param {number} userId - 结束方用户ID
 * @param {Object} data - { peer_id, call_id, end_reason }
 */
async function handleCallEnd(userId, data) {
  const { peer_id, call_id, end_reason } = data;
  if (!peer_id) return;

  // 计算通话时长并更新记录
  if (call_id) {
    try {
      // 超时无人接听：把 ringing 状态的记录标记为 missed
      if (end_reason === 'timeout') {
        await callService.markMissed(call_id);
        websocketService.sendToUser(peer_id, {
          type: WsEvents.CALL_ENDED,
          data: { user_id: userId, call_id, end_reason: 'timeout' }
        });
        return;
      }
      const result = await callService.endCall(call_id, userId, end_reason || 'hangup');
      // 将通话时长传给对方
      websocketService.sendToUser(peer_id, {
        type: WsEvents.CALL_ENDED,
        data: { user_id: userId, call_id, duration: result.duration, end_reason: end_reason || 'hangup' }
      });
      return;
    } catch (err) {
      console.error('更新通话结束记录失败:', err.message);
    }
  }

  websocketService.sendToUser(peer_id, {
    type: WsEvents.CALL_ENDED, data: { user_id: userId }
  });
}

/**
 * 转发 ICE 候选
 * @param {number} userId - 发送方用户ID
 * @param {Object} data - { peer_id, candidate }
 */
function handleIceCandidate(userId, data) {
  const { peer_id, candidate } = data;
  if (!peer_id || !candidate) return;
  websocketService.sendToUser(peer_id, {
    type: WsEvents.ICE_CANDIDATE, data: { user_id: userId, candidate }
  });
}

module.exports = {
  handleCallRequest,
  handleCallAccept,
  handleCallReject,
  handleCallEnd,
  handleIceCandidate,
};
