/**
 * 聊天详情页 - WebSocket实时聊天 + 图片发送 + 上拉加载 + 时间分组
 */
import { ref, reactive, computed, onMounted, onUnmounted, nextTick } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '../utils/api.js';
import { chatState, addLocalMessage } from '../store/chatStore.js';
import { userState } from '../store/userStore.js';
import { toast } from '../utils/toast.js';
import { wsState, send, onMessage, offMessage } from '../utils/websocket.js';

export default {
  setup() {
    const route = useRoute();
    const router = useRouter();
    const conversationId = ref(parseInt(route.params.id));
    const messages = ref([]);
    const text = ref('');
    const loading = ref(true);
    const chatEl = ref(null);
    const uploading = ref(false);
    const imagePreview = reactive({ visible: false, url: '' });
    const hasMore = ref(true);
    const loadingMore = ref(false);
    const PAGE_SIZE = 50;
    let offset = 0;

    function formatTimeLabel(t) {
      if (!t) return '';
      const d = new Date(t);
      const now = new Date();
      const isToday = d.toDateString() === now.toDateString();
      const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1);
      const isYesterday = d.toDateString() === yesterday.toDateString();
      const hm = ('0'+d.getHours()).slice(-2) + ':' + ('0'+d.getMinutes()).slice(-2);
      if (isToday) return hm;
      if (isYesterday) return '昨天 ' + hm;
      return (d.getMonth()+1) + '月' + d.getDate() + '日 ' + hm;
    }

    const processedMessages = computed(() => {
      const msgs = [...messages.value];
      msgs.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
      const result = [];
      for (let i = 0; i < msgs.length; i++) {
        const msg = msgs[i];
        const prev = i > 0 ? msgs[i - 1] : null;
        const timeDiff = prev ? (new Date(msg.created_at) - new Date(prev.created_at)) / 1000 / 60 : Infinity;
        if (!prev || timeDiff > 5) {
          result.push({ _type: 'time', _time: formatTimeLabel(msg.created_at) });
        }
        result.push(msg);
      }
      return result;
    });

    async function loadMessages() {
      loading.value = true;
      offset = 0;
      hasMore.value = true;
      try {
        const res = await api.get('/chat/messages', { conversation_id: conversationId.value, limit: PAGE_SIZE, offset: 0 });
        if (res.code === 0) {
          const list = res.data || [];
          messages.value = list.reverse();
          offset = list.length;
          hasMore.value = list.length >= PAGE_SIZE;
        }
      } catch (err) { toast.error('加载消息失败'); }
      finally { loading.value = false; scrollToBottom(); }
    }

    async function loadMore() {
      if (!hasMore.value || loadingMore.value) return;
      loadingMore.value = true;
      const prevScrollHeight = chatEl.value?.scrollHeight || 0;
      try {
        const res = await api.get('/chat/messages', { conversation_id: conversationId.value, limit: PAGE_SIZE, offset });
        if (res.code === 0) {
          const older = (res.data || []).reverse();
          messages.value = [...older, ...messages.value];
          offset += older.length;
          hasMore.value = older.length >= PAGE_SIZE;
          // 保持滚动位置
          nextTick(() => {
            if (chatEl.value) {
              chatEl.value.scrollTop = chatEl.value.scrollHeight - prevScrollHeight;
            }
          });
        }
      } catch (err) { /* 静默 */ }
      finally { loadingMore.value = false; }
    }

    function onScroll() {
      if (!chatEl.value) return;
      if (chatEl.value.scrollTop <= 50 && hasMore.value && !loadingMore.value) {
        loadMore();
      }
    }

    function scrollToBottom() {
      nextTick(() => {
        if (chatEl.value) chatEl.value.scrollTop = chatEl.value.scrollHeight;
      });
    }

    function handleWsMessage(data) {
      if (data.type === 'message' && data.data && data.data.conversation_id === conversationId.value) {
        // 匹配乐观更新的临时消息
        const tempId = data.data._temp_id;
        if (tempId) {
          const idx = messages.value.findIndex(m => m._temp_id === tempId);
          if (idx > -1) {
            const oldMsg = messages.value[idx];
            messages.value[idx] = { ...oldMsg, ...data.data, _local: false };
          } else {
            messages.value.push(data.data);
          }
        } else {
          // 去重
          if (data.data.id && !messages.value.find(m => m.id === data.data.id)) {
            messages.value.push(data.data);
          } else if (!data.data.id) {
            messages.value.push(data.data);
          }
        }
        scrollToBottom();
        api.post('/chat/mark-read', { conversation_id: conversationId.value }).catch(() => {});
      }
      // 处理 gift_received（礼物消息）
      if (data.type === 'gift_received' && data.data && data.data.conversation_id === conversationId.value) {
        const giftMsg = {
          conversation_id: data.data.conversation_id,
          sender_id: data.data.sender_id,
          content: JSON.stringify({ gift_name: data.data.gift_name, gift_image: data.data.gift_image, quantity: data.data.quantity }),
          type: 2,
          created_at: new Date().toISOString()
        };
        messages.value.push(giftMsg);
        scrollToBottom();
      }
    }

    // 键盘适配：visualViewport resize
    function onViewportResize() {
      if (window.visualViewport && chatEl.value) {
        const viewport = window.visualViewport;
        const diff = window.innerHeight - viewport.height;
        if (diff > 100) {
          // 键盘弹出
          chatEl.value.style.paddingBottom = (diff - 60) + 'px';
          scrollToBottom();
        } else {
          chatEl.value.style.paddingBottom = '0px';
        }
      }
    }

    async function sendMessage() {
      const content = text.value.trim();
      if (!content) return;
      const tempId = '_tmp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
      const msg = {
        conversation_id: conversationId.value,
        sender_id: userState.userId,
        content,
        type: 0,
        _temp_id: tempId
      };
      addLocalMessage(msg);
      messages.value.push({ ...msg, _local: true, _temp_id: tempId, created_at: new Date().toISOString() });
      text.value = '';
      scrollToBottom();
      const sent = send({ type: 'message', data: { ...msg, _temp_id: tempId } });
      if (!sent) {
        try { await api.post('/chat/messages', msg); } catch (err) { toast.error('发送失败'); }
      }
    }

    function compressImage(file, maxWidth = 800, quality = 0.8) {
      return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          let { width, height } = img;
          if (width > maxWidth) { height = Math.round(height * maxWidth / width); width = maxWidth; }
          const canvas = document.createElement('canvas');
          canvas.width = width; canvas.height = height;
          canvas.getContext('2d').drawImage(img, 0, 0, width, height);
          canvas.toBlob(blob => {
            if (blob) resolve(new File([blob], file.name, { type: 'image/jpeg' }));
            else resolve(file);
          }, 'image/jpeg', quality);
        };
        img.onerror = () => resolve(file);
        img.src = URL.createObjectURL(file);
      });
    }

    async function onImageSelect(e) {
      const file = e.target.files[0];
      if (!file) return;
      uploading.value = true;
      try {
        const compressed = await compressImage(file);
        const fd = new FormData();
        fd.append('image', compressed);
        const res = await api.upload('/upload/image', fd);
        if (res.code === 0 && res.data) {
          const msg = {
            conversation_id: conversationId.value,
            sender_id: userState.userId,
            content: res.data.url,
            type: 1
          };
          messages.value.push({ ...msg, _local: true, created_at: new Date().toISOString() });
          scrollToBottom();
          const sent = send({ type: 'message', data: msg });
          if (!sent) {
            try { await api.post('/chat/messages', msg); } catch (err) { toast.error('发送失败'); }
          }
        }
      } catch (err) { toast.error('图片上传失败: ' + err.message); }
      finally { uploading.value = false; e.target.value = ''; }
    }

    function previewImage(url) { imagePreview.url = url; imagePreview.visible = true; }

    // 长按消息操作
    const showMsgMenu = ref(false);
    const menuTarget = ref(null);
    let msgPressTimer = null;

    function onMsgTouchStart(msg) {
      msgPressTimer = setTimeout(() => {
        menuTarget.value = msg;
        showMsgMenu.value = true;
      }, 600);
    }
    function onMsgTouchEnd() { clearTimeout(msgPressTimer); }
    function onMsgTouchMove() { clearTimeout(msgPressTimer); }

    async function copyMsg() {
      const m = menuTarget.value;
      if (m && m.content && m.type !== 1) {
        try { await navigator.clipboard.writeText(m.content); toast.success('已复制'); }
        catch (e) { toast.error('复制失败'); }
      }
      showMsgMenu.value = false;
    }

    async function recallMsg() {
      const m = menuTarget.value;
      if (!m || !m.id) return;
      // 检查2分钟内
      const elapsed = (Date.now() - new Date(m.created_at).getTime()) / 1000 / 60;
      if (elapsed > 2) { toast.warning('超过2分钟无法撤回'); showMsgMenu.value = false; return; }
      try {
        await api.post('/chat/messages/' + m.id + '/recall');
        // 本地替换
        const idx = messages.value.findIndex(msg => msg.id === m.id);
        if (idx > -1) {
          messages.value[idx] = { ...m, content: '你撤回了一条消息', type: 99 };
        }
        toast.success('已撤回');
      } catch (err) { toast.error(err.message); }
      showMsgMenu.value = false;
    }

    function deleteMsgLocal() {
      const m = menuTarget.value;
      messages.value = messages.value.filter(msg => msg !== m);
      showMsgMenu.value = false;
    }

    // 在线状态与已读回执监听
    const partnerOnline = ref(false);
    function handleOnlineStatus(data) {
      if (data.data && data.data.user_id) {
        // 如果在线状态属于当前聊天的对方
        partnerOnline.value = data.data.online;
      }
    }
    function handleReadReceipt(data) {
      if (data.data && data.data.conversation_id === conversationId.value) {
        // 标记消息已读
        messages.value.forEach(m => {
          if (m.sender_id === userState.userId) m._read = true;
        });
      }
    }

    function onKeydown(e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    }

    function timeStr(t) {
      if (!t) return '';
      const d = new Date(t);
      return ('0'+d.getHours()).slice(-2) + ':' + ('0'+d.getMinutes()).slice(-2);
    }

    onMounted(() => {
      loadMessages();
      onMessage('message', handleWsMessage);
      onMessage('gift_received', handleWsMessage);
      onMessage('online_status', handleOnlineStatus);
      onMessage('read_receipt', handleReadReceipt);
      if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', onViewportResize);
      }
    });
    onUnmounted(() => {
      offMessage('message', handleWsMessage);
      offMessage('gift_received', handleWsMessage);
      offMessage('online_status', handleOnlineStatus);
      offMessage('read_receipt', handleReadReceipt);
    onUnmounted(() => {
      offMessage('message', handleWsMessage);
      offMessage('gift_received', handleWsMessage);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', onViewportResize);
      }
    });

    return { messages, processedMessages, text, loading, loadingMore, hasMore, uploading, chatEl, imagePreview,
      showMsgMenu, menuTarget,
      sendMessage, onKeydown, onScroll, timeStr, onImageSelect, previewImage,
      onMsgTouchStart, onMsgTouchEnd, onMsgTouchMove, copyMsg, recallMsg, deleteMsgLocal };
  },
  template: `
    <div style="display:flex;flex-direction:column;height:100%">
      <div ref="chatEl" @scroll="onScroll" style="flex:1;overflow-y:auto;padding:12px 16px">
        <!-- 加载更多 -->
        <div v-if="loadingMore" style="text-align:center;padding:12px"><div class="loading-spinner" style="width:24px;height:24px;border-width:2px"></div></div>
        <div v-else-if="!hasMore && !loading" style="text-align:center;padding:12px;font-size:12px;color:var(--text-muted)">没有更多消息了</div>

        <div v-if="loading" class="text-center" style="padding:48px"><div class="loading-spinner"></div></div>
        <div v-else-if="messages.length === 0" class="empty-state" style="padding:64px 24px">
          <div class="empty-icon">💬</div><div class="empty-title">开始聊天吧</div>
        </div>
        <template v-else v-for="item in processedMessages" :key="item.id || item._temp_id || item._time">
          <div v-if="item._type === 'time'" class="msg-system">{{ item._time }}</div>
          <div v-else :style="{display:'flex',justifyContent:item.sender_id===userState.userId?'flex-end':'flex-start',marginBottom:'12px'}">
            <div v-if="item.sender_id !== userState.userId && item.type !== 99" class="avatar-circle avatar-sm" style="margin-right:8px;align-self:flex-end">
              <img v-if="item.sender_avatar" :src="item.sender_avatar" />
              <span v-else class="avatar-default" style="font-size:16px">👤</span>
            </div>
            <div :style="{
              maxWidth:item.type===1?'60%':'75%',
              padding:item.type===1?'4px':'10px 14px',
              borderRadius:item.type===99?'8px':(item.sender_id===userState.userId?'16px 16px 4px 16px':'16px 16px 16px 4px'),
              background:item.type===99?'transparent':(item.sender_id===userState.userId?'var(--primary)':'var(--bg-white)'),
              color:item.type===99?'var(--text-muted)':(item.sender_id===userState.userId?'#fff':'var(--text)'),
              boxShadow:item.type===99||item.sender_id===userState.userId?'none':'var(--shadow)'
            }"
              @touchstart.stop="onMsgTouchStart(item)" @touchend="onMsgTouchEnd" @touchmove="onMsgTouchMove">
              <div v-if="item.type===99" style="font-size:13px;opacity:.8;text-align:center">{{ item.content }}</div>
              <img v-else-if="item.type===1" :src="item.content" @click="previewImage(item.content)" class="msg-image" style="display:block" />
              <div v-else style="font-size:15px;line-height:1.5;word-break:break-word">{{ item.content }}</div>
              <div :style="{fontSize:'10px',marginTop:'4px',textAlign:'right',opacity:item.sender_id===userState.userId?0.7:0.5,color:item.type===99?'var(--text-muted)':(item.sender_id===userState.userId?'#fff':'var(--text-muted)')}">
                {{ timeStr(item.created_at) }}<span v-if="item._local" style="margin-left:4px">⏳</span>
                <span v-if="item.sender_id===userState.userId && item._read" style="margin-left:4px">✓✓</span>
              </div>
              </div>
            </div>
            <div v-if="item.sender_id===userState.userId && item.type!==99" class="avatar-circle avatar-sm" style="margin-left:8px;align-self:flex-end">
              <img v-if="userState.userInfo?.avatar" :src="userState.userInfo.avatar" />
              <span v-else class="avatar-default" style="font-size:16px">👤</span>
            </div>
          </div>
        </template>
      </div>

      <div class="chat-input-area">
        <label style="width:40px;height:40px;display:flex;align-items:center;justify-content:center;font-size:22px;cursor:pointer;color:var(--text-secondary);flex-shrink:0">
          <span v-if="uploading" class="loading-spinner" style="width:20px;height:20px;border-width:2px"></span>
          <span v-else>📷</span>
          <input type="file" accept="image/*" style="display:none" @change="onImageSelect" :disabled="uploading" />
        </label>
        <div class="input-group" style="flex:1;border-radius:20px">
          <input v-model="text" placeholder="说点什么..." @keydown="onKeydown" :disabled="uploading" />
        </div>
        <button class="btn btn-primary" style="border-radius:50%;width:40px;height:40px;padding:0;flex-shrink:0" @click="sendMessage" :disabled="!text.trim()||uploading">➤</button>
      </div>

      <div v-if="imagePreview.visible" class="image-preview-overlay" @click="imagePreview.visible = false">
        <img :src="imagePreview.url" class="image-preview-img" />
        <button class="image-preview-close" @click="imagePreview.visible = false">✕</button>
      </div>

      <!-- 长按操作菜单 -->
      <div v-if="showMsgMenu" class="match-modal" @click.self="showMsgMenu = false">
        <div style="background:var(--bg-white);border-radius:16px 16px 0 0;width:100%;padding:20px 16px;padding-bottom:calc(20px+env(safe-area-inset-bottom,0px));animation:slideUp .3s ease-out">
          <h4 style="margin-bottom:16px;text-align:center">消息操作</h4>
          <div v-if="menuTarget && menuTarget.type !== 1 && menuTarget.type !== 99" class="card-item" @click="copyMsg">📋 复制</div>
          <div v-if="menuTarget && menuTarget.sender_id === userState.userId && menuTarget.id" class="card-item" @click="recallMsg">↩ 撤回</div>
          <div class="card-item" @click="deleteMsgLocal" style="color:var(--error)">🗑 删除</div>
          <button class="btn btn-outline btn-block mt-12" @click="showMsgMenu = false">取消</button>
        </div>
      </div>
    </div>
  `
};
