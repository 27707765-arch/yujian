/**
 * WebSocket 管理
 * 自动连接、心跳保持、指数退避断线重连
 */
import { reactive } from 'vue';
import { getToken, clearToken } from './api.js';

const state = reactive({
  connected: false,
  connecting: false,
  reconnecting: false,
  reconnectAttempt: 0,
  lastError: null
});

let ws = null;
let reconnectTimer = null;
let pingTimer = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;

// 消息处理器注册表
const handlers = new Map();

function onMessage(type, handler) {
  if (!handlers.has(type)) handlers.set(type, []);
  handlers.get(type).push(handler);
}

function offMessage(type, handler) {
  if (!handlers.has(type)) return;
  const list = handlers.get(type);
  const idx = list.indexOf(handler);
  if (idx > -1) list.splice(idx, 1);
}

function send(data) {
  if (ws && state.connected) {
    ws.send(JSON.stringify(data));
    return true;
  }
  return false;
}

function connect() {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    return;
  }

  const token = getToken();
  if (!token) return;

  state.connecting = true;
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const url = `${protocol}//${location.host}?token=${token}`;

  try {
    ws = new WebSocket(url);

    ws.onopen = () => {
      state.connected = true;
      state.connecting = false;
      state.reconnecting = false;
      state.reconnectAttempt = 0;
      state.lastError = null;
      reconnectAttempts = 0;

      pingTimer = setInterval(() => {
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ping' }));
        }
      }, 30000);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type && handlers.has(data.type)) {
          handlers.get(data.type).forEach(h => h(data));
        }
        if (handlers.has('*')) {
          handlers.get('*').forEach(h => h(data));
        }
      } catch (e) {
        console.warn('WebSocket消息解析失败:', e);
      }
    };

    ws.onclose = (event) => {
      state.connected = false;
      state.connecting = false;
      clearInterval(pingTimer);
      if (event.code !== 1000 && event.code !== 1001) {
        scheduleReconnect();
      }
    };

    ws.onerror = (err) => {
      state.lastError = 'WebSocket连接错误';
      console.error('WebSocket error:', err);
    };
  } catch (err) {
    state.connecting = false;
    console.error('WebSocket创建失败:', err);
  }
}

/**
 * 指数退避重连: min(2000 * 2^attempt, 30000)
 */
function scheduleReconnect() {
  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    console.warn('WebSocket重连次数已达上限');
    state.reconnecting = false;
    return;
  }
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectAttempts++;
  state.reconnecting = true;
  state.reconnectAttempt = reconnectAttempts;
  const delay = Math.min(2000 * Math.pow(2, reconnectAttempts - 1), 30000);
  reconnectTimer = setTimeout(() => {
    connect();
  }, delay);
}

function disconnect() {
  clearInterval(pingTimer);
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  reconnectAttempts = MAX_RECONNECT_ATTEMPTS;
  if (ws) {
    ws.close(1000, '用户主动断开');
    ws = null;
  }
  state.connected = false;
  state.connecting = false;
  state.reconnecting = false;
}

export { state as wsState, connect, disconnect, send, onMessage, offMessage };
