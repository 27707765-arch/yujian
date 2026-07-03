/**
 * 聊天状态管理
 * 管理会话列表、当前会话消息、未读数
 */

import { reactive, computed } from 'vue';
import { api } from '../utils/api.js';

const state = reactive({
  conversations: [],
  currentConversation: null,
  messages: [],
  unreadCount: 0,
  loading: false
});

const hasUnread = computed(() => state.unreadCount > 0);

/**
 * 加载会话列表
 */
async function loadConversations() {
  state.loading = true;
  try {
    const res = await api.get('/chat/conversations');
    if (res.code === 0) {
      state.conversations = res.data || [];
    }
  } catch (err) {
    console.error('加载会话列表失败:', err);
  } finally {
    state.loading = false;
  }
}

/**
 * 加载会话消息
 */
async function loadMessages(conversationId, limit = 50, beforeId = null) {
  state.loading = true;
  try {
    const params = { conversation_id: conversationId, limit };
    if (beforeId) params.before = beforeId;
    const res = await api.get('/chat/messages', params);
    if (res.code === 0) {
      state.messages = (res.data || []).reverse();
    }
  } catch (err) {
    console.error('加载消息失败:', err);
  } finally {
    state.loading = false;
  }
}

/**
 * 添加本地消息（乐观更新）
 */
function addLocalMessage(msg) {
  state.messages.push({
    ...msg,
    _local: true,
    created_at: new Date().toISOString()
  });
}

/**
 * 更新会话最后消息
 */
function updateConversationLastMsg(conversationId, lastMsg) {
  const conv = state.conversations.find(c => c.id === conversationId);
  if (conv) {
    conv.last_message = lastMsg.content;
    conv.last_time = new Date().toISOString();
  }
}

/**
 * 增加未读计数
 */
function addUnreadCount(count = 1) {
  state.unreadCount += count;
}

/**
 * 清除未读
 */
function clearUnread() {
  state.unreadCount = 0;
}

/**
 * 设置当前会话
 */
function setCurrentConversation(conv) {
  state.currentConversation = conv;
  state.messages = [];
}

export {
  state as chatState,
  hasUnread,
  loadConversations,
  loadMessages,
  addLocalMessage,
  updateConversationLastMsg,
  addUnreadCount,
  clearUnread,
  setCurrentConversation
};
