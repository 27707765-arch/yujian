/**
 * 金币充值
 */
import { ref } from 'vue';
import { api } from '../utils/api.js';
import { toast } from '../utils/toast.js';

export default {
  setup() {
    const loading = ref(false);
    const amounts = [6, 18, 30, 68, 128, 298];
    const selected = ref(null);
    const payMethod = ref('wechat');

    async function recharge() {
      if (!selected.value) { toast.warning('请选择充值金额'); return; }
      loading.value = true;
      try {
        const res = await api.post('/orders/recharge', { amount: selected.value });
        if (res.code === 0) {
          toast.success(`充值成功！获得 ${res.data.coins} 金币`);
          selected.value = null;
        }
      } catch (err) { toast.error(err.message); }
      finally { loading.value = false; }
    }

    return { amounts, selected, payMethod, loading, recharge };
  },
  template: `
    <div class="page-padding" style="padding-top:20px;padding-bottom:20px">
      <div class="recharge-header">
        <div class="recharge-header-icon">💰</div>
        <h2 class="mt-12">金币充值</h2>
        <p class="recharge-rate">1元 = 100金币</p>
      </div>
      <div class="amount-grid">
        <div v-for="a in amounts" :key="a"
          @click="selected = a"
          :class="['amount-card', selected === a ? 'selected' : '']">
          <div class="amount-value">¥{{ a }}</div>
          <div class="amount-coins">{{ a * 100 }} 金币</div>
        </div>
      </div>
      <div class="pay-methods">
        <button class="btn btn-sm" :class="payMethod==='wechat'?'btn-primary':'btn-outline'" @click="payMethod='wechat'">💚 微信支付</button>
        <button class="btn btn-sm" :class="payMethod==='alipay'?'btn-primary':'btn-outline'" @click="payMethod='alipay'">💙 支付宝</button>
      </div>
      <button class="btn btn-primary btn-block btn-lg" style="margin-top:20px" @click="recharge" :disabled="loading || !selected">
        {{ loading ? '处理中...' : '确认支付 ¥' + (selected || 0) }}
      </button>
    </div>
  `
};
