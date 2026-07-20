/**
 * 聊天列表页 (全新视觉)
 */
import { ref, reactive, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../utils/api.js';
import { chatState, loadConversations, updateConversationLastMsg } from '../store/chatStore.js';
import { isLoggedIn, userState } from '../store/userStore.js';
import { toast } from '../utils/toast.js';
import { onMessage, offMessage } from '../utils/websocket.js';

export default {
  setup() {
    const router = useRouter();
    const loading = ref(true);
    const showActionSheet = ref(false);
    const actionTarget = ref(null);
    let pressTimer = null;

    onMounted(async () => {
      if (!isLoggedIn.value) { router.replace('/login'); return; }
      await loadConversations();
      chatState.unreadCount = chatState.conversations.reduce((sum, c) => sum + (c.unread_count || 0), 0);
      loading.value = false;
      onMessage('message', handleNewMessage);
    });
    onUnmounted(() => { offMessage('message', handleNewMessage); });

    function handleNewMessage(data) {
      if (!data.data) return;
      const convId = data.data.conversation_id;
      const existing = chatState.conversations.find(c => c.id === convId);
      if (existing) {
        existing.last_message = data.data.content || (data.data.type === 1 ? '[图片]' : '');
        existing.last_time = data.created_at || new Date().toISOString();
        existing.last_sender_id = data.data.sender_id;
        existing.last_msg_type = data.data.type || 0;
        const currentHash = window.location.hash;
        if (!currentHash.includes('/chat/' + convId)) {
          existing.unread_count = (existing.unread_count || 0) + 1;
          chatState.unreadCount = (chatState.unreadCount || 0) + 1;
        }
        const idx = chatState.conversations.indexOf(existing);
        if (idx > 0) { chatState.conversations.splice(idx, 1); chatState.conversations.unshift(existing); }
      }
    }

    function openChat(conv) { router.push(`/chat/${conv.id}`); }

    function onTouchStart(conv) { pressTimer = setTimeout(() => { actionTarget.value = conv; showActionSheet.value = true; }, 600); }
    function onTouchEnd() { clearTimeout(pressTimer); }
    function onTouchMove() { clearTimeout(pressTimer); }

    async function deleteConv() {
      if (!actionTarget.value) return;
      try { await api.delete('/chat/conversations/' + actionTarget.value.id); toast.success('已删除'); const idx = chatState.conversations.findIndex(c => c.id === actionTarget.value.id); if (idx > -1) chatState.conversations.splice(idx, 1); } catch (e) { toast.error(e.message); }
      finally { showActionSheet.value = false; }
    }
    async function pinConv() {
      if (!actionTarget.value) return;
      try { await api.put('/chat/conversations/' + actionTarget.value.id + '/pin'); toast.success('已置顶'); } catch (e) { toast.error(e.message); }
      finally { showActionSheet.value = false; }
    }

    function lastMsgPreview(conv) {
      const msg = conv.last_message || ''; if (!msg) return '暂无消息';
      if (conv.last_msg_type === 1) return '[图片]'; if (conv.last_msg_type === 2) return '[礼物]'; if (conv.last_msg_type === 99) return '[系统消息]';
      if (conv.last_sender_id === chatState.userId) return '我：' + msg; return msg;
    }
    function fmtTime(t) {
      if (!t) return ''; const d = new Date(t); const now = new Date();
      if (d.toDateString() === now.toDateString()) return ('0'+d.getHours()).slice(-2) + ':' + ('0'+d.getMinutes()).slice(-2);
      const y = new Date(now); y.setDate(y.getDate()-1); if (d.toDateString() === y.toDateString()) return '昨天';
      if (now.getTime()-d.getTime() < 604800000) return ['周日','周一','周二','周三','周四','周五','周六'][d.getDay()];
      return (d.getMonth()+1)+'/'+d.getDate();
    }

    return { chatState, loading, showActionSheet, openChat, onTouchStart, onTouchEnd, onTouchMove,
      deleteConv, pinConv, lastMsgPreview, fmtTime, userState };
  },
  template: `
    <div>
      <div v-if="loading" style="padding:16px">
        <div v-for="i in 5" :key="'sk'+i" style="display:flex;gap:14px;align-items:center;padding:16px;background:#FFF;border-radius:16px;margin-bottom:8px;box-shadow:0 2px 8px rgba(0,0,0,.03)">
          <div class="skeleton skeleton-avatar"></div>
          <div style="flex:1"><div class="skeleton skeleton-text" style="width:50%"></div><div class="skeleton skeleton-text-short"></div></div>
        </div>
      </div>

      <div v-else-if="chatState.conversations.length===0" class="empty-state">
        <div class="empty-icon">💬</div><div class="empty-title">还没有聊过天</div><div class="empty-desc">在「遇见」中匹配好友，开始聊天吧</div>
      </div>

      <div v-else style="padding-top:4px">
        <div v-for="conv in chatState.conversations" :key="conv.id" @click="openChat(conv)"
          @touchstart.stop="onTouchStart(conv)" @touchend="onTouchEnd" @touchmove="onTouchMove"
          style="display:flex;align-items:center;padding:16px;gap:14px;cursor:pointer;margin:0 12px 6px;background:#FFF;border-radius:18px;box-shadow:0 2px 8px rgba(0,0,0,.03);transition:all .15s">
          <!-- 头像 -->
          <div style="position:relative;flex-shrink:0">
            <div style="width:52px;height:52px;border-radius:50%;overflow:hidden;background:linear-gradient(135deg,#E8E8ED,#D1D1D6);display:flex;align-items:center;justify-content:center">
              <img v-if="conv.other_avatar" :src="conv.other_avatar" style="width:100%;height:100%;object-fit:cover" />
              <span v-else style="font-size:24px">👤</span>
            </div>
            <span v-if="conv.other_online" style="position:absolute;bottom:1px;right:1px;width:12px;height:12px;border-radius:50%;background:#34C759;border:2px solid #FFF"></span>
          </div>
          <!-- 内容 -->
          <div style="flex:1;min-width:0">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px">
              <span style="font-weight:700;font-size:16px;color:#1D1D1F">{{ conv.other_nickname||'用户' }}</span>
              <span style="font-size:12px;color:#AEAEB2">{{ fmtTime(conv.last_time) }}</span>
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center">
              <span style="font-size:14px;color:#86868B;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:75%">{{ lastMsgPreview(conv) }}</span>
              <span v-if="conv.unread_count>0" style="background:#FF3B30;color:#FFF;font-size:11px;min-width:20px;height:20px;border-radius:10px;display:flex;align-items:center;justify-content:center;padding:0 6px;font-weight:600">
                {{ conv.unread_count>99?'99+':conv.unread_count }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- 长按菜单 -->
      <div v-if="showActionSheet" class="match-modal" @click.self="showActionSheet=false">
        <div style="background:#FFF;border-radius:20px 20px 0 0;width:100%;max-width:500px;padding:24px 20px;padding-bottom:calc(24px+env(safe-area-inset-bottom,0px));animation:slideUp .3s ease-out">
          <div style="width:36px;height:4px;border-radius:2px;background:#E5E5EA;margin:0 auto 20px"></div>
          <div @click="pinConv" style="padding:16px;text-align:center;font-size:16px;font-weight:600;background:#F5F5F7;border-radius:14px;margin-bottom:8px;cursor:pointer">📌 置顶聊天</div>
          <div @click="deleteConv" style="padding:16px;text-align:center;font-size:16px;font-weight:600;background:#FFF0F0;border-radius:14px;margin-bottom:8px;cursor:pointer;color:#FF3B30">🗑 删除聊天</div>
          <button class="btn btn-outline btn-block" @click="showActionSheet=false" style="border-color:#E5E5EA;color:#86868B;margin-top:4px;border-radius:14px">取消</button>
        </div>
      </div>
    </div>
  `
};
