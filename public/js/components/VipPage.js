/**
 * VIP会员中心
 */
import { ref, onMounted } from 'vue';
import { api } from '../utils/api.js';
import { toast } from '../utils/toast.js';

export default {
  setup() {
    const packages = ref([]);
    const loading = ref(false);
    onMounted(async () => {
      try {
        const res = await api.get('/user/vip-info');
        if (res.code === 0 && res.data) packages.value = res.data.packages || [];
      } catch (err) { /* */ }
    });
    async function buyVip(pkg) {
      loading.value = true;
      try {
        const res = await api.post('/orders/vip', { package_id: pkg.id });
        if (res.code === 0) toast.success(res.message || '开通成功');
      } catch (err) { toast.error(err.message); }
      finally { loading.value = false; }
    }
    return { packages, loading, buyVip };
  },
  template: `
    <div class="page-padding" style="padding-top:20px;padding-bottom:20px">
      <div class="vip-header">
        <div class="vip-header-icon">👑</div>
        <h2 class="mt-12">遇见VIP</h2>
        <p class="text-muted" style="font-size:14px;margin-top:4px">解锁更多特权</p>
      </div>
      <div v-if="packages.length === 0" class="text-center text-muted" style="padding:24px">暂无可购买套餐</div>
      <div v-else v-for="pkg in packages" :key="pkg.id" class="pkg-card">
        <div class="pkg-price">¥{{ pkg.price }}</div>
        <div class="pkg-name">{{ pkg.name }}</div>
        <div class="pkg-duration">{{ pkg.duration }}天有效期</div>
        <button class="btn btn-primary btn-block" @click="buyVip(pkg)" :disabled="loading">立即开通</button>
      </div>
      <div class="privilege-box">
        <h4>VIP特权</h4>
        <p class="privilege-list">✅ 查看更多推荐<br>✅ 高级筛选功能<br>✅ 查看谁喜欢了我<br>✅ 专属身份标识<br>✅ 无限制发起聊天</p>
      </div>
    </div>
  `
};
