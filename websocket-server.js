/**
 * WebSocket 服务器
 * 处理实时消息通信，包括聊天消息、输入状态和心跳检测
 */

const WebSocket = require('ws');
const jwt = require('jsonwebtoken');
const Conversation = require('./src/models/Conversation');
const Message = require('./src/models/Message');
const Block = require('./src/models/Block');
const websocketService = require('./src/services/websocket.service');
const contentAuditService = require('./src/services/contentAudit.service');
const antifraudService = require('./src/services/antifraud.service');

// 心跳配置
const HEARTBEAT_INTERVAL = 30000; // 服务端每30秒发送一次 ping
const CONNECTION_TIMEOUT = 10000;  // 客户端10秒内未回复 pong 则断开

/**
 * 启动WebSocket服务器
 * @param {http.Server} server - HTTP服务器实例
 */
function startWebSocketServer(server) {
  const wss = new WebSocket.Server({ server });

  // 定时心跳检测：清理僵死连接
  const heartbeatTimer = setInterval(() => {
    wss.clients.forEach((ws) => {
      // 如果客户端超过超时时间未响应 pong，终止连接
      if (ws.isAlive === false) {
        console.log('WebSocket 心跳超时，终止连接');
        return ws.terminate();
      }

      // 标记为未响应，发送 ping
      ws.isAlive = false;
      ws.ping();
    });
  }, HEARTBEAT_INTERVAL);

  // 服务器关闭时清理定时器
  wss.on('close', () => {
    clearInterval(heartbeatTimer);
  });

  // 处理连接
  wss.on('connection', (ws, req) => {
    let userId = null;

    // 初始化心跳状态
    ws.isAlive = true;

    // 接收 pong 响应，标记连接为活跃
    ws.on('pong', () => {
      ws.isAlive = true;
    });

    // 验证用户身份
    const url = new URL(req.url, `http://${req.headers.host}`);
    const token = url.searchParams.get('token');

    if (!token) {
      ws.close(4001, '未提供认证令牌');
      return;
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_jwt_secret_key');
      userId = decoded.id;

      // 注册客户端
      websocketService.registerClient(userId, ws);

      // 发送连接成功消息
      ws.send(JSON.stringify({
        type: 'connected',
        message: '连接成功'
      }));
    } catch (err) {
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
    ws.on('close', () => {
      if (userId) {
        websocketService.unregisterClient(userId, ws);
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
 * @param {number} userId - 发送者ID
 * @param {Object} data - 消息数据
 */
async function handleSendMessage(userId, data) {
  const { receiver_id, content, type = 0 } = data;

  // 验证参数
  if (!receiver_id || !content) {
    return;
  }

  // 内容审核：检查敏感词
  const auditResult = contentAuditService.checkSensitiveContent(content);
  if (!auditResult.pass) {
    // 通知发送者消息被拦截
    websocketService.sendToUser(userId, {
      type: 'message_blocked',
      data: {
        receiver_id,
        reason: auditResult.message,
        timestamp: new Date().toISOString()
      }
    });
    console.log(`用户 ${userId} 的消息被拦截: ${auditResult.message}`);
    return;
  }

  // 过滤敏感词后发送
  const filteredContent = contentAuditService.filterSensitiveContent(content);

  // 反欺诈：检查消息发送行为
  const msgRiskCheck = await antifraudService.checkMessageBehavior(userId, filteredContent);
  if (msgRiskCheck.blocked) {
    websocketService.sendToUser(userId, {
      type: 'message_blocked',
      data: {
        receiver_id,
        reason: '消息发送异常，已被系统拦截',
        timestamp: new Date().toISOString()
      }
    });
    console.log(`用户 ${userId} 的消息被反欺诈拦截: ${msgRiskCheck.reasons.join(', ')}`);
    return;
  }

  // 检查拉黑关系（双向）：存在拉黑则不能发消息
  const isMutualBlocked = await Block.isMutualBlocked(userId, receiver_id);
  if (isMutualBlocked) {
    websocketService.sendToUser(userId, {
      type: 'message_blocked',
      data: {
        receiver_id,
        reason: '无法发送消息，存在拉黑关系',
        timestamp: new Date().toISOString()
      }
    });
    console.log(`用户 ${userId} 向 ${receiver_id} 发送消息被拦截: 存在拉黑关系`);
    return;
  }

  try {
    // 创建或获取会话
    const conversation = await Conversation.createOrGet(userId, receiver_id);

    // 创建消息（使用过滤后的内容）
    const message = await Message.create({
      conversation_id: conversation.id,
      sender_id: userId,
      receiver_id,
      content: filteredContent,
      type
    });

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
        created_at: message.created_at
      }
    };

    // 发送消息给接收者
    websocketService.sendToUser(receiver_id, messageObj);

    // 发送消息确认给发送者
    websocketService.sendToUser(userId, {
      type: 'message_sent',
      data: message
    });
  } catch (err) {
    console.error('发送消息失败:', err);
  }
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
 */
async function handleCallRequest(userId, data) {
  const { receiver_id, call_type = 'voice' } = data;
  if (!receiver_id) return;

  const blocked = await Block.isMutualBlocked(userId, receiver_id);
  if (blocked) {
    websocketService.sendToUser(userId, {
      type: 'call_blocked',
      data: { receiver_id, reason: '无法发起通话，存在拉黑关系' }
    });
    return;
  }

  websocketService.sendToUser(receiver_id, {
    type: 'call_request',
    data: { caller_id: userId, call_type, timestamp: new Date().toISOString() }
  });
}

function handleCallAccept(userId, data) {
  const { caller_id } = data;
  if (!caller_id) return;
  websocketService.sendToUser(caller_id, {
    type: 'call_accepted', data: { receiver_id: userId }
  });
}

function handleCallReject(userId, data) {
  const { caller_id, reason } = data;
  if (!caller_id) return;
  websocketService.sendToUser(caller_id, {
    type: 'call_rejected', data: { receiver_id: userId, reason: reason || '对方拒绝了通话' }
  });
}

function handleCallEnd(userId, data) {
  const { peer_id } = data;
  if (!peer_id) return;
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

module.exports = {
  startWebSocketServer
};
