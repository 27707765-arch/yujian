/**
 * 我的收益
 */
import { ref, onMounted } from 'vue';
import { api } from '../utils/api.js';

export default {
  setup() {
    const wallet = ref({ balance: 0, total_earned: 0 });
    const transactions = ref([]);
    const loading = ref(true);
    onMounted(async () => {
      try {
        const [wRes, tRes] = await Promise.all([
          api.get('/wallet/info'),
          api.get('/wallet/transactions', { limit: 50 })
        ]);
        if (wRes.code === 0) wallet.value = wRes.data;
        if (tRes.code === 0) transactions.value = tRes.data || [];
      } catch (err) { /* */ }
      finally { loading.value = false; }
    });
    function fmtAmount(a) {
      return a > 0 ? '+' + a : String(a);
    }
    function timeStr(t) {
      return new Date(t).toLocaleString('zh-CN');
    }
    function txIcon(type) {
      if (type === 'gift_receive') return '🎁';
      if (type === 'recharge') return '💳';
      return '💰';
    }
    return { wallet, transactions, loading, fmtAmount, timeStr, txIcon };
  },
  template: `
    <div class="page-padding" style="padding-top:16px;padding-bottom:16px">
      <div class="earnings-hero">
        <div class="earnings-hero-label">累计收益</div>
        <div class="earnings-hero-amount">🪙 {{ wallet.total_earned || 0 }}</div>
        <div class="earnings-hero-balance">当前余额: {{ wallet.balance || 0 }} 金币</div>
      </div>
      <h4 class="mb-12">收益明细</h4>
      <div v-if="loading" class="text-center" style="padding:32px"><div class="loading-spinner"></div></div>
      <div v-else-if="transactions.length===0" class="empty-state"><div class="empty-icon">📊</div><div class="empty-title">暂无记录</div></div>
      <div v-else v-for="tx in transactions" :key="tx.id" class="tx-item">
        <span class="tx-icon">{{ txIcon(tx.type) }}</span>
        <div class="tx-info">
          <div class="tx-desc">{{ tx.description || tx.type }}</div>
          <div class="tx-time">{{ timeStr(tx.created_at) }}</div>
        </div>
        <span class="tx-amount" :class="tx.amount > 0 ? 'tx-positive' : 'tx-negative'">{{ fmtAmount(tx.amount) }}</span>
      </div>
    </div>
  `
};
