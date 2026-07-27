/**
 * 礼物面板 - 底部弹出弹窗
 * Props: visible, receiverId, conversationId
 * Emits: sent, close
 */
import { ref, watch } from 'vue';
import { api } from '../utils/api.js';
import { toast } from '../utils/toast.js';

export default {
  props: {
    visible: Boolean,
    receiverId: Number,
    conversationId: Number
  },
  emits: ['sent', 'close'],
  setup(props, { emit }) {
    const gifts = ref([]);
    const selectedGift = ref(null);
    const quantity = ref(1);
    const message = ref('');
    const sending = ref(false);
    const balance = ref(0);
    const loading = ref(false);

    watch(() => props.visible, async (v) => {
      if (v) {
        loading.value = true;
        selectedGift.value = null;
        quantity.value = 1;
        message.value = '';
        try {
          const [gRes, wRes] = await Promise.all([
            api.get('/gifts/list'),
            api.get('/wallet/info')
          ]);
          if (gRes.code === 0) gifts.value = gRes.data || [];
          if (wRes.code === 0) balance.value = wRes.data?.balance || 0;
        } catch (err) { /* */ }
        finally { loading.value = false; }
      }
    });

    function selectGift(g) { selectedGift.value = g; }

    async function sendGift() {
      if (!selectedGift.value) { toast.warning('请选择礼物'); return; }
      if (!props.receiverId) { toast.error('接收用户异常'); return; }
      sending.value = true;
      try {
        const res = await api.post('/gifts/send', {
          receiver_id: props.receiverId,
          gift_id: selectedGift.value.id,
          quantity: quantity.value,
          message: message.value || undefined,
          conversation_id: props.conversationId || undefined
        });
        if (res.code === 0) {
          toast.success('礼物已送出！');
          emit('sent', selectedGift.value);
          emit('close');
        }
      } catch (err) { toast.error(err.message); }
      finally { sending.value = false; }
    }

    function fmtGiftIcon(g) {
      if (g.image) return g.image;
      if (g.emoji) return g.emoji;
      const icons = { rose: '🌹', heart: '❤️', diamond: '💎', crown: '👑', cake: '🎂', bear: '🧸', angel: '😇' };
      return icons[g.name] || '🎁';
    }

    return { gifts, selectedGift, quantity, message, sending, balance, loading,
      selectGift, sendGift, fmtGiftIcon, emit };
  },
  template: `
    <div v-if="visible" class="match-modal" @click.self="emit('close')">
      <div style="background:var(--bg-white);border-radius:16px 16px 0 0;width:100%;max-height:80vh;overflow-y:auto;padding:20px 16px;padding-bottom:calc(20px + env(safe-area-inset-bottom, 0px));animation:slideUp .3s ease-out">
        <!-- 头部 -->
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
          <h3 style="font-size:17px">🎁 送礼物</h3>
          <span style="font-size:13px;color:var(--text-muted)">余额：🪙 {{ balance }}</span>
          <button @click="emit('close')" style="border:none;background:none;font-size:24px;cursor:pointer;color:var(--text-muted)">✕</button>
        </div>

        <div v-if="loading" class="loading-spinner"></div>

        <!-- 礼物网格 -->
        <div v-else class="amount-grid" style="margin-bottom:16px">
          <div v-for="g in gifts" :key="g.id"
            @click="selectGift(g)"
            :class="['amount-card', selectedGift?.id === g.id ? 'selected' : '']"
            style="padding:12px 8px">
            <div style="font-size:32px;margin-bottom:4px">{{ fmtGiftIcon(g) }}</div>
            <div style="font-size:13px;font-weight:500">{{ g.name }}</div>
            <div class="amount-coins" style="font-size:11px">{{ g.price }}金币</div>
          </div>
        </div>

        <!-- 数量 & 留言 -->
        <div v-if="selectedGift" style="border-top:1px solid var(--border);padding-top:12px">
          <div class="info-row" style="margin-bottom:12px;justify-content:center">
            <span style="font-size:13px;color:var(--text-secondary)">数量：</span>
            <button @click="quantity = Math.max(1, quantity-1)" style="width:32px;height:32px;border:1px solid var(--border);border-radius:50%;background:var(--bg-white);font-size:18px;cursor:pointer">−</button>
            <span style="font-size:18px;font-weight:600;margin:0 12px;min-width:24px;text-align:center">{{ quantity }}</span>
            <button @click="quantity = Math.min(99, quantity+1)" style="width:32px;height:32px;border:1px solid var(--border);border-radius:50%;background:var(--bg-white);font-size:18px;cursor:pointer">+</button>
          </div>
          <div class="input-group" style="margin-bottom:12px;border-radius:20px">
            <input v-model="message" placeholder="附上留言（可选）" maxlength="100" />
          </div>
          <div class="text-center text-muted" style="font-size:12px;margin-bottom:12px">
            合计：{{ selectedGift.price * quantity }} 金币
          </div>
          <button class="btn btn-primary btn-block" @click="sendGift" :disabled="sending">
            {{ sending ? '赠送中...' : '确认赠送 🎁' }}
          </button>
        </div>
      </div>
    </div>
  `
};
