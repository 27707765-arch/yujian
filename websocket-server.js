/**
 * WebSocket 服务器
 * 处理实时消息通信，包括聊天消息、输入状态和心跳检测
 */

const WebSocket = require('ws');
const jwt = require('jsonwebtoken');
const websocketService = require('./src/services/websocket.service');
const offlineMessageService = require('./src/services/offlineMessage.service');
const WsEvents = require('./src/constants/wsEvents');
const {
  handleSendMessage,
  handleTyping,
  handleStopTyping,
  handleRecallMessage,
  handleReadReceipt,
  broadcastOnlineStatus,
} = require('./src/ws/handlers/chat');
const {
  handleCallRequest,
  handleCallAccept,
  handleCallReject,
  handleCallEnd,
  handleIceCandidate,
} = require('./src/ws/handlers/call');

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
        type: WsEvents.CONNECTED,
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
        if (data.type === WsEvents.PONG) {
          ws.isAlive = true;
          return;
        }

        switch (data.type) {
          case WsEvents.SEND_MESSAGE:
            await handleSendMessage(userId, data);
            break;
          case WsEvents.TYPING:
            handleTyping(userId, data);
            break;
          case WsEvents.STOP_TYPING:
            handleStopTyping(userId, data);
            break;
          // 语音/视频通话信令
          case WsEvents.CALL_REQUEST:
            handleCallRequest(userId, data);
            break;
          case WsEvents.CALL_ACCEPT:
            handleCallAccept(userId, data);
            break;
          case WsEvents.CALL_REJECT:
            handleCallReject(userId, data);
            break;
          case WsEvents.CALL_END:
            handleCallEnd(userId, data);
            break;
          case WsEvents.CALL_ICE_CANDIDATE:
            handleIceCandidate(userId, data);
            break;
          case WsEvents.RECALL_MESSAGE:
            handleRecallMessage(userId, data);
            break;
          case WsEvents.READ_RECEIPT:
            handleReadReceipt(userId, data);
            break;
          default:
            console.log('未知消息类型:', data.type);
        }
      } catch (err) {
        console.error('处理消息失败:', err);
        ws.send(JSON.stringify({
          type: WsEvents.ERROR,
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
module.exports = {
  startWebSocketServer
};



