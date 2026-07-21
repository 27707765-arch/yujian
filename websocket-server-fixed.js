/**
 * WebSocket 服务器 - 修复版
 * 修复问题：
 * 1. 连接关闭时未清理客户端注册导致消息丢失
 * 2. 消息发送失败时未通知发送者
 * 3. 添加离线消息存储
 */

const WebSocket = require('ws');
const jwt = require('jsonwebtoken');
const Conversation = require('./src/models/Conversation');
const Message = require('./src/models/Message');
const Block = require('./src/models/Block');
const websocketService = require('./src/services/websocket.service');
const contentAuditService = require('./src/services/contentAudit.service');
const antifraudService = require('./src/services/antifraud.service');
const callService = require('./src/services/call.service');

// 心跳配置
const HEARTBEAT_INTERVAL = 30000;
const CONNECTION_TIMEOUT = 45000;

// 离线消息队列（内存存储，生产环境建议用Redis）
const offlineMessages = new Map(); // userId -> [messages]

/**
 * 存储离线消息
 */
function storeOfflineMessage(userId, message) {
  if (!offlineMessages.has(userId)) {
    offlineMessages.set(userId, []);
  }
  const messages = offlineMessages.get(userId);
  messages.push({
    ...message,
    stored_at: new Date().toISOString()
  });
  // 限制每个用户最多存储100条离线消息
  if (messages.length > 100) {
    messages.shift();
  }
  console.log(`[WS] 存储离线消息给用户 ${userId}，当前队列长度: ${messages.length}`);
}

/**
 * 发送离线消息
 */
function sendOfflineMessages(userId) {
  const messages = offlineMessages.get(userId);
  if (!messages || messages.length === 0) return;
  
  console.log(`[WS] 用户 ${userId} 上线，发送 ${messages.length} 条离线消息`);
  
  for (const msg of messages) {
    websocketService.sendToUser(userId, msg);
  }
  
  // 清空离线消息队列
  offlineMessages.delete(userId);
}

/**
 * 启动WebSocket服务器
 */
function startWebSocketServer(server) {
  const wss = new WebSocket.Server({ server });
  let onlineCount = 0;

  // 心跳检测
  const heartbeatTimer = setInterval(() => {
    let deadCount = 0;
    wss.clients.forEach((ws) => {
      if (ws.isAlive === false) {
        deadCount++;
        ws.terminate();
        return;
      }
      ws.isAlive = false;
      ws.ping();
    });
    if (deadCount > 0) {
      console.log(`[WS] 心跳检测：清理 ${deadCount} 个僵死连接，当前在线: ${onlineCount - deadCount}`);
    }
  }, HEARTBEAT_INTERVAL);

  wss.on('close', () => {
    clearInterval(heartbeatTimer);
    console.log('[WS] WebSocket服务器已关闭');
  });

  // 处理新连接
  wss.on('connection', (ws, req) => {
    let userId = null;
    ws.isAlive = true;
    onlineCount++;
    
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    console.log(`[WS] 新连接 (IP: ${clientIp}, 当前在线: ${onlineCount})`);

    // 心跳响应
    ws.on('pong', () => {
      ws.isAlive = true;
    });

    // ========== 关键修复：连接关闭时清理注册 ==========
    ws.on('close', (code, reason) => {
      onlineCount--;
      if (userId) {
        websocketService.unregisterClient(userId, ws);
        // 广播离线状态
        broadcastOnlineStatus(userId, false);
        console.log(`[WS] 用户 ${userId} 断开连接 (code: ${code})，当前在线: ${onlineCount}`);
      } else {
        console.log(`[WS] 未认证连接断开，当前在线: ${onlineCount}`);
      }
    });

    ws.on('error', (err) => {
      console.error(`[WS] 连接错误:`, err.message);
    });

    // JWT认证
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

      // 注册客户端
      websocketService.registerClient(userId, ws);
      ws._userId = userId;

      // 广播在线状态
      setTimeout(() => broadcastOnlineStatus(userId, true), 500);

      // 发送连接成功消息
      ws.send(JSON.stringify({
        type: 'connected',
        message: '连接成功',
        data: {
          heartbeatInterval: HEARTBEAT_INTERVAL,
          serverTime: new Date().toISOString()
        }
      }));

      // ========== 新增：发送离线消息 ==========
      setTimeout(() => sendOfflineMessages(userId), 1000);

    } catch (err) {
      console.log(`[WS] 无效令牌: ${err.message}`);
      ws.close(4002, '无效的认证令牌');
      return;
    }

    // 消息处理
    ws.on('message', async (message) => {
      try {
        const data = JSON.parse(message);

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
            console.log(`[WS] 未知消息类型: ${data.type}`);
            // 返回错误给客户端
            ws.send(JSON.stringify({
              type: 'error',
              data: { message: `未知消息类型: ${data.type}` }
            }));
        }
      } catch (err) {
        console.error('[WS] 处理消息失败:', err);
        ws.send(JSON.stringify({
          type: 'error',
          data: { message: '消息处理失败' }
        }));
      }
    });
  });

  return wss;
}

/**
 * 处理发送消息 - 增强版
 */
async function handleSendMessage(userId, data) {
  const { receiver_id, content, type = 0, ...extraData } = data;
  const msgType = parseInt(type) || 0;

  // 参数验证
  if (!receiver_id) {
    websocketService.sendToUser(userId, {
      type: 'send_error',
      data: { message: '缺少接收者ID', receiver_id }
    });
    return;
  }
  
  if (msgType <= 1 && !content) {
    websocketService.sendToUser(userId, {
      type: 'send_error',
      data: { message: '消息内容不能为空', receiver_id }
    });
    return;
  }

  let filteredContent = content || '';

  // 内容审核
  if (msgType <= 1 && content) {
    const auditResult = contentAuditService.checkSensitiveContent(content);
    if (!auditResult.pass) {
      websocketService.sendToUser(userId, {
        type: 'message_blocked',
        data: { receiver_id, reason: auditResult.message, timestamp: new Date().toISOString() }
      });
      return;
    }
    filteredContent = contentAuditService.filterSensitiveContent(content);

    const msgRiskCheck = await antifraudService.checkMessageBehavior(userId, filteredContent);
    if (msgRiskCheck.blocked) {
      websocketService.sendToUser(userId, {
        type: 'message_blocked',
        data: { receiver_id, reason: '消息发送异常，已被系统拦截', timestamp: new Date().toISOString() }
      });
      return;
    }
  }

  // 检查拉黑关系
  const isMutualBlocked = await Block.isMutualBlocked(userId, receiver_id);
  if (isMutualBlocked) {
    websocketService.sendToUser(userId, {
      type: 'message_blocked',
      data: { receiver_id, reason: '无法发送消息，存在拉黑关系', timestamp: new Date().toISOString() }
    });
    return;
  }

  try {
    // 创建或获取会话
    const conversation = await Conversation.createOrGet(userId, receiver_id);

    // 构建消息数据
    const msgData = {
      conversation_id: conversation.id,
      sender_id: userId,
      receiver_id,
      content: filteredContent,
      type: msgType
    };

    // 附加不同类型消息的额外数据
    if (msgType === 2) { 
      msgData.voice_url = extraData.voice_url || null; 
      msgData.voice_duration = parseInt(extraData.voice_duration) || 0; 
    }
    if (msgType === 3) { 
      msgData.video_url = extraData.video_url || null; 
      msgData.video_duration = parseInt(extraData.video_duration) || 0; 
      msgData.video_cover = extraData.video_cover || null; 
    }
    if (msgType === 4) { 
      msgData.sticker_id = parseInt(extraData.sticker_id) || null; 
    }
    if (msgType === 5) { 
      msgData.location_data = extraData.location_data || null; 
    }
    if (msgType === 6) { 
      msgData.gift_data = extraData.gift_data || null; 
    }

    // 保存消息到数据库
    const message = await Message.create(msgData);

    // 构建消息对象
    const messageObj = {
      type: 'message',
      data: {
        id: message.id,
        conversation_id: message.conversation_id,
        sender_id: message.sender_id,
        receiver_id: message.receiver_id,
        content: message.content,
        type: message.type,
        status: message.status,
        created_at: message.created_at,
        voice_url: message.voice_url,
        voice_duration: message.voice_duration,
        video_url: message.video_url,
        video_duration: message.video_duration,
        video_cover: message.video_cover,
        sticker_id: message.sticker_id,
        location_data: message.location_data,
        gift_data: message.gift_data
      }
    };

    // ========== 关键修复：发送消息给接收者，失败时存储离线消息 ==========
    const sent = websocketService.sendToUser(receiver_id, messageObj);
    if (!sent) {
      // 接收者不在线，存储离线消息
      storeOfflineMessage(receiver_id, messageObj);
      console.log(`[WS] 用户 ${receiver_id} 不在线，消息已存储为离线消息`);
    }

    // 发送确认给发送者
    websocketService.sendToUser(userId, {
      type: 'message_sent',
      data: {
        ...message,
        offline: !sent // 告知发送者对方是否在线
      }
    });

    // 记录亲密度
    try {
      const intimacyService = require('./src/services/intimacy.service');
      intimacyService.onChatMessage(userId, receiver_id).catch(() => {});
    } catch (e) {}

  } catch (err) {
    console.error('[WS] 发送消息失败:', err);
    websocketService.sendToUser(userId, {
      type: 'send_error',
      data: { 
        message: '消息发送失败: ' + err.message, 
        receiver_id,
        original_content: content 
      }
    });
  }
}

// ... 其他处理函数保持不变 ...
// handleTyping, handleStopTyping, handleCallRequest 等

/**
 * 广播在线状态
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
    // 静默处理
  }
}

module.exports = { startWebSocketServer };
