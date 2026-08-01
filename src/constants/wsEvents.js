/**
 * WebSocket 事件常量（集中定义，避免散落的字符串魔数）
 * 供 websocket-server / 服务端推送 / 前端消费统一引用
 */

const WsEvents = {
  // ==================== 连接/心跳 ====================
  CONNECTED: 'connected',
  PING: 'ping',
  PONG: 'pong',
  ERROR: 'error',

  // ==================== 聊天 ====================
  SEND_MESSAGE: 'send_message',
  MESSAGE: 'message',                 // 推送新消息（接收方）
  MESSAGE_SENT: 'message_sent',       // 发送方确认
  MESSAGE_RECALLED: 'message_recalled',
  RECALL_MESSAGE: 'recall_message',
  RECALL_FAILED: 'recall_failed',
  MESSAGE_BLOCKED: 'message_blocked',
  TYPING: 'typing',
  STOP_TYPING: 'stop_typing',
  READ_RECEIPT: 'read_receipt',
  ONLINE_STATUS: 'online_status',

  // ==================== 匹配 ====================
  MATCH_SUCCESS: 'match_success',

  // ==================== 通话信令 ====================
  CALL_REQUEST: 'call_request',
  CALL_ACCEPT: 'call_accept',
  CALL_REJECT: 'call_reject',
  CALL_END: 'call_end',
  CALL_ICE_CANDIDATE: 'call_ice_candidate',
  CALL_ACCEPTED: 'call_accepted',
  CALL_REJECTED: 'call_rejected',
  CALL_ENDED: 'call_ended',
  CALL_INITIATED: 'call_initiated',
  CALL_BLOCKED: 'call_blocked',
  CALL_USER_OFFLINE: 'call_user_offline',
  CALL_ERROR: 'call_error',
  ICE_CANDIDATE: 'ice_candidate',
};

module.exports = WsEvents;
