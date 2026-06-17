// 文件名：src/services/websocket.service.js
// 用途：WebSocket服务

class WebSocketService {
  constructor() {
    this.clients = new Map(); // userId -> Set<WebSocket>
  }

  registerClient(userId, ws) {
    if (!this.clients.has(userId)) {
      this.clients.set(userId, new Set());
    }
    this.clients.get(userId).add(ws);
    console.log(`用户 ${userId} 已连接 (设备数: ${this.clients.get(userId).size})`);
  }

  unregisterClient(userId, ws) {
    const sockets = this.clients.get(userId);
    if (!sockets) return;
    sockets.delete(ws);
    if (sockets.size === 0) {
      this.clients.delete(userId);
      console.log(`用户 ${userId} 已完全断开连接`);
    }
  }

  isUserOnline(userId) {
    const sockets = this.clients.get(userId);
    return sockets ? sockets.size > 0 : false;
  }

  sendToUser(userId, message) {
    const sockets = this.clients.get(userId);
    if (!sockets || sockets.size === 0) return false;
    let sent = false;
    const msgStr = JSON.stringify(message);
    for (const ws of sockets) {
      if (ws.readyState === 1) {
        try {
          ws.send(msgStr);
          sent = true;
        } catch (error) {
          console.error(`发送消息给用户 ${userId} 失败:`, error);
        }
      }
    }
    return sent;
  }

  broadcast(message) {
    const msgStr = JSON.stringify(message);
    for (const [userId, sockets] of this.clients) {
      for (const ws of sockets) {
        if (ws.readyState === 1) {
          try {
            ws.send(msgStr);
          } catch (error) {
            console.error(`广播消息给用户 ${userId} 失败:`, error);
          }
        }
      }
    }
  }

  getOnlineCount() {
    return this.clients.size;
  }

  getOnlineUsers() {
    return Array.from(this.clients.keys());
  }
}

// 导出单例
module.exports = new WebSocketService();