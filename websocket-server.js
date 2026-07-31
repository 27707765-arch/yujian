/**
 * WebSocket 服务器
 * 处理实时消息通信，包括聊天消息、输入状态和心跳检测
 */

const WebSocket = require('ws');
const jwt = require('jsonwebtoken');
const Conversation = require('./src/models/Conversation');
const Block = require('./src/models/Block');
const websocketService = require('./src/services/websocket.service');
const callService = require('./src/services/call.service');
const offlineMessageService = require('./src/services/offlineMessage.service');

// 心跳配置（针对移动网络优化）
// 移动网络特点：4G/5G切换、信号波动可导致5-15秒无响应
// 参考：微信心跳30s，钉钉心跳25s，WhatsApp心跳30s
const HEARTBEAT_INTERVAL = 30000; // 服务端每30秒发送一次 ping
const CONNECTION_TIMEOUT = 45000;  // 客户端45秒内（1.5个心跳周期）未回复 pong 则断开
// 为什么45秒而不是更短：移动网络下TCP连接可能短暂阻塞10-20秒

/**
 * 启动WebSocket服务器
 * @param {http.Server} server - HTTP服务器实例
 */
function startWebSocketServer(server) {
  const wss = new WebSocket.Server({ server });

  // 全局异常捕获 - 防止未处理的异常导致进程退出
  process.on('uncaughtException', (err) => {
    console.error('[FATAL] 未捕获异常:', err.message);
    console.error(err.stack);
  });
  process.on('unhandledRejection', (reason) => {
    console.error('[FATAL] 未处理的Promise拒绝:', reason);
  });
  wss.on('error', (err) => {
    console.error('[WS] WebSocket Server错误:', err.message);
  });

  let onlineCount = 0;

  // 定时心跳检测：清理僵死连接
  const heartbeatTimer = setInterval(() => {
    let deadCount = 0;
    wss.clients.forEach((ws) => {
      // 如果客户端超过超时时间未响应 pong，终止连接
      if (ws.isAlive === false) {
        deadCount++;
        ws.terminate();
        return;
      }

      // 标记为未响应，发送 ping
      ws.isAlive = false;
      ws.ping();
    });

    if (deadCount > 0) {
      console.log(`[WS] 心跳检测：清理 ${deadCount} 个僵死连接，当前在线: ${onlineCount - deadCount}`);
    }
  }, HEARTBEAT_INTERVAL);

  // 服务器关闭时清理定时器
  wss.on('close', () => {
    clearInterval(heartbeatTimer);
    console.log('[WS] WebSocket服务器已关闭');
  });

  // 处理连接
  wss.on('connection', (ws, req) => {
    let userId = null;

    // 初始化心跳状态
    ws.isAlive = true;
    onlineCount++;
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    console.log(`[WS] 新连接 (IP: ${clientIp}, 当前在线: ${onlineCount})`);

    // 接收 pong 响应，标记连接为活跃
    ws.on('pong', () => {
      ws.isAlive = true;
    });

    // 验证用户身份
    const url = new URL(req.url, `http://${req.headers.host}`);
    const token = url.searchParams.get('token');

    if (!token) {
      console.log('[WS] 未提供认证令牌，关闭连接');
      ws.close(4001, '未提供认证令牌');
      return;
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_jwt_secret_key');
      userId = decoded.id;

      // 注册客户端 + 广播在线状态
      websocketService.registerClient(userId, ws);
      ws._userId = userId;

      // 广播在线状态给所有会话对方
      setTimeout(() => broadcastOnlineStatus(userId, true), 500);

      // 发送连接成功消息（含心跳参数让客户端适配）
      ws.send(JSON.stringify({
        type: 'connected',
        message: '连接成功',
        data: {
          heartbeatInterval: HEARTBEAT_INTERVAL,  // 告知客户端心跳间隔
          serverTime: new Date().toISOString()
        }
      }));

      // 异步获取并发送离线消息
      setTimeout(async () => {
        try {
          const offlineMessages = await offlineMessageService.getOfflineMessages(userId);
          if (offlineMessages.length > 0) {
            console.log(`[WS] 为用户 ${userId} 推送 ${offlineMessages.length} 条离线消息`);
            for (const msg of offlineMessages) {
              if (ws.readyState === 1) {
                ws.send(JSON.stringify(msg));
                // 每条消息间隔50ms，避免消息堆积
                await new Promise(resolve => setTimeout(resolve, 50));
              }
            }
          }
        } catch (err) {
          console.error('[WS] 推送离线消息失败:', err.message);
        }
      }, 1000); // 延迟1秒，确保客户端已准备好接收
    } catch (err) {
      console.log(`[WS] 无效令牌: ${err.message}`);
      ws.close(4002, '无效的认证令牌');
      return;
    }

    // 处理消息
    ws.on('message', async (message) => {
      try {
        const data = JSON.parse(message);

        // 处理客户端心跳响应（pong 消息）
        if (data.type === 'pong') {
          ws.isAlive = true;
          return;
        }

        switch (data.type) {
          case 'send_message':
            await handleSendMessage(userId, data);
            break;
          case 'typing':
            handleTyping(userId, data);
            break;
          case 'stop_typing':
            handleStopTyping(userId, data);
            break;
          // 语音/视频通话信令
          case 'call_request':
            handleCallRequest(userId, data);
            break;
          case 'call_accept':
            handleCallAccept(userId, data);
            break;
          case 'call_reject':
            handleCallReject(userId, data);
            break;
          case 'call_end':
            handleCallEnd(userId, data);
            break;
          case 'call_ice_candidate':
            handleIceCandidate(userId, data);
            break;
          case 'recall_message':
            handleRecallMessage(userId, data);
            break;
          case 'read_receipt':
            handleReadReceipt(userId, data);
            break;
          default:
            console.log('未知消息类型:', data.type);
        }
      } catch (err) {
        console.error('处理消息失败:', err);
        ws.send(JSON.stringify({
          type: 'error',
          message: '处理消息失败'
        }));
      }
    });

    // 处理断开连接
    ws.on('close', (code, reason) => {
      onlineCount = Math.max(0, onlineCount - 1);
      if (userId) {
        websocketService.unregisterClient(userId, ws);

        // 延迟30秒广播离线（防短暂断线）
        const uid = userId;
        setTimeout(() => {
          if (!websocketService.isUserOnline(uid)) {
            broadcastOnlineStatus(uid, false);
          }
        }, 30000);

        // 给用户的其他设备发送离线通知（可选）
        const closeReason = code === 4001 ? '未认证'
          : code === 4002 ? '令牌无效'
          : code === 1006 ? '网络异常断开'
          : reason?.toString() || `正常关闭(code:${code})`;
        console.log(`[WS] 用户 ${userId} 断开 (${closeReason}, 在线: ${onlineCount})`);
      } else {
        console.log(`[WS] 未认证连接断开 (在线: ${onlineCount})`);
      }
    });

    // 处理错误
    ws.on('error', (err) => {
      console.error('WebSocket错误:', err);
    });
  });

  console.log('WebSocket服务器已启动（含心跳检测）');
  return wss;
}

/**
 * 处理发送消息
 * 实现收敛：转调 chat.service.sendMessage（唯一实现，含审核/反欺诈/拉黑/WS推送/离线）
 * @param {number} userId - 发送者ID
 * @param {Object} data - 消息数据
 */
async function handleSendMessage(userId, data) {
  const chatService = require('./src/services/chat.service');

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
      type: 'message_blocked',
      data: { receiver_id: result.receiver_id, reason: result.reason, timestamp: new Date().toISOString() }
    });
    return;
  }
  if (!result.success) {
    // 参数/业务错误
    websocketService.sendToUser(userId, {
      type: 'error',
      data: { message: result.message }
    });
    return;
  }

  // 发送消息确认给发送者，包含送达状态
  websocketService.sendToUser(userId, {
    type: 'message_sent',
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
      type: 'typing',
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
      type: 'stop_typing',
      data: { user_id: userId }
    });
  }
}

// ==================== 通话信令 ====================

/**
 * 发起通话请求（voice/video）
 * 增强版：创建通话记录 + 生成Agora Token
 */
async function handleCallRequest(userId, data) {
  const { receiver_id, call_type = 'voice' } = data;
  if (!receiver_id) return;

  // 1. 拉黑检测
  const blocked = await Block.isMutualBlocked(userId, receiver_id);
  if (blocked) {
    websocketService.sendToUser(userId, {
      type: 'call_blocked',
      data: { receiver_id, reason: '无法发起通话，存在拉黑关系' }
    });
    return;
  }

  // 2. 检查对方是否在线
  const isOnline = websocketService.isUserOnline(receiver_id);
  if (!isOnline) {
    websocketService.sendToUser(userId, {
      type: 'call_user_offline',
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
      type: 'call_error',
      data: { receiver_id, message: err.message }
    });
    return;
  }

  // 4. 转发呼叫请求（携带Token和记录ID）
  websocketService.sendToUser(receiver_id, {
    type: 'call_request',
    data: {
      caller_id: userId,
      call_type,
      call_id: callRecord.call_id,
      channel_name: callRecord.channel_name,
      agora_token: callRecord.token,
      simulate: callRecord.simulate,
      timestamp: new Date().toISOString()
    }
  });

  // 5. 给发起方确认（带call_id和token）
  websocketService.sendToUser(userId, {
    type: 'call_initiated',
    data: {
      receiver_id,
      call_id: callRecord.call_id,
      channel_name: callRecord.channel_name,
      agora_token: callRecord.token,
      simulate: callRecord.simulate
    }
  });
}

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
    type: 'call_accepted',
    data: {
      receiver_id: userId,
      call_id,
      channel_name: channelName,
      agora_token: token
    }
  });
}

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
    type: 'call_rejected', data: { receiver_id: userId, reason: reason || '对方拒绝了通话' }
  });
}

async function handleCallEnd(userId, data) {
  const { peer_id, call_id, end_reason } = data;
  if (!peer_id) return;

  // 计算通话时长并更新记录
  if (call_id) {
    try {
      const result = await callService.endCall(call_id, userId, end_reason || 'hangup');
      // 将通话时长传给对方
      websocketService.sendToUser(peer_id, {
        type: 'call_ended',
        data: { user_id: userId, call_id, duration: result.duration, end_reason: end_reason || 'hangup' }
      });
      return;
    } catch (err) {
      console.error('更新通话结束记录失败:', err.message);
    }
  }

  websocketService.sendToUser(peer_id, {
    type: 'call_ended', data: { user_id: userId }
  });
}

function handleIceCandidate(userId, data) {
  const { peer_id, candidate } = data;
  if (!peer_id || !candidate) return;
  websocketService.sendToUser(peer_id, {
    type: 'ice_candidate', data: { user_id: userId, candidate }
  });
}

/**
 * 处理消息撤回（通过 WebSocket 实时撤回）
 * 客户端发送 { type: "recall_message", data: { message_id } }
 * 实现收敛：转调 chat.service.recallMessage（唯一实现，含 WS 推送双方）
 */
async function handleRecallMessage(userId, data) {
  const { message_id } = data;
  if (!message_id) return;

  const chatService = require('./src/services/chat.service');
  const result = await chatService.recallMessage(message_id, userId);

  if (!result.success) {
    // 撤回失败，仅通知发起者
    websocketService.sendToUser(userId, {
      type: 'recall_failed',
      data: { message_id, reason: result.message }
    });
  }
}

function handleReadReceipt(userId, data) {
  const { conversation_id, receiver_id } = data;
  if (conversation_id) {
    // 通知会话对方已读
    const targetId = receiver_id || userId;
    websocketService.sendToUser(targetId, {
      type: 'read_receipt',
      data: { conversation_id, reader_id: userId, timestamp: new Date().toISOString() }
    });
  }
}

/**
 * 广播在线/离线状态给用户的所有会话对方
 */
async function broadcastOnlineStatus(userId, online) {
  try {
    const conversations = await Conversation.getUserConversations(userId);
    for (const conv of conversations) {
      const otherId = conv.user1_id === userId ? conv.user2_id : conv.user1_id;
      websocketService.sendToUser(otherId, {
        type: 'online_status',
        data: { user_id: userId, online }
      });
    }
  } catch (err) {
    // 静默处理，不影响主流程
  }
}

module.exports = {
  startWebSocketServer
};



