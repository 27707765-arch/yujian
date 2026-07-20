/**
 * 每日签到页
 */
import { ref, reactive, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../utils/api.js';
import { toast } from '../utils/toast.js';
import { isLoggedIn } from '../store/userStore.js';

export default {
  setup() {
    const router = useRouter();
    const status = reactive({ today_checked_in: false, streak: 0, history: [] });
    const tasks = ref([]);
    const loading = ref(true);
    const checkingIn = ref(false);
    const coinAnimation = ref(0); // 触发金币动画的奖励数

    async function loadAll() {
      loading.value = true;
      try {
        const [sRes, tRes] = await Promise.all([
          api.get('/checkin/status'),
          api.get('/checkin/tasks')
        ]);
        if (sRes.code === 0) Object.assign(status, sRes.data);
        if (tRes.code === 0) tasks.value = tRes.data || [];
      } catch (err) { toast.error('加载失败'); }
      finally { loading.value = false; }
    }

    onMounted(() => {
      if (!isLoggedIn.value) { router.replace('/login'); return; }
      loadAll();
    });

    async function doCheckin() {
      checkingIn.value = true;
      try {
        const res = await api.post('/checkin/');
        if (res.code === 0) {
          status.today_checked_in = true;
          status.streak = (status.streak || 0) + 1;
          // 金币动画
          coinAnimation.value = res.data?.coins || 10;
          toast.success('签到成功！');
          setTimeout(() => { coinAnimation.value = 0; }, 2000);
        }
      } catch (err) { toast.error(err.message); }
      finally { checkingIn.value = false; }
    }

    // 7天日历占位
    const weekDays = computed(() => {
      const days = [];
      for (let i = 1; i <= 7; i++) {
        const checked = status.history?.includes?.(i) || (status.today_checked_in && i <= status.streak);
        days.push({ day: i, checked });
      }
      return days;
    });

    // emoji for tasks
    function taskIcon(type) {
      const m = { complete_profile: '📝', upload_photo: '📷', like_user: '❤️',
        send_message: '💬', publish_post: '📱', send_gift: '🎁' };
      return m[type] || '✅';
    }

    return { status, tasks, loading, checkingIn, coinAnimation, weekDays, doCheckin, taskIcon };
  },
  template: `
    <div class="page-padding">
      <!-- 签到卡片 -->
      <div class="gradient-header-pink" style="border-radius:var(--radius);margin-bottom:12px">
        <div class="text-center">
          <div style="font-size:14px;opacity:.9">连续签到</div>
          <div style="font-size:48px;font-weight:700;margin:8px 0">{{ status.streak || 0 }}<span style="font-size:24px"> 天</span></div>
          <div style="font-size:13px;opacity:.8">今日奖励：🪙 +{{ Math.min((status.streak || 0) + 1, 7) * 10 }} 金币</div>
        </div>

        <!-- 7天日历 -->
        <div style="display:flex;justify-content:center;gap:12px;margin-top:16px">
          <div v-for="d in weekDays" :key="d.day"
            :style="{
              width:'36px', height:'36px', borderRadius:'50%',
              background: d.checked ? '#fff' : 'rgba(255,255,255,.3)',
              color: d.checked ? 'var(--primary)' : '#fff',
              display:'flex', alignItems:'center', justifyContent:'center',
              fontSize:'14px', fontWeight:'600', transition:'all .3s'
            }">
            {{ d.day }}
          </div>
        </div>

        <!-- 签到按钮 -->
        <div class="text-center mt-12">
          <button v-if="!status.today_checked_in" class="btn" style="background:#fff;color:var(--primary);font-weight:700"
            @click="doCheckin" :disabled="checkingIn">
            {{ checkingIn ? '签到中...' : '✨ 今日签到 ✨' }}
          </button>
          <div v-else style="font-size:16px;opacity:.9">✅ 今日已签到</div>
        </div>
      </div>

      <!-- 金币动画 -->
      <div v-if="coinAnimation" style="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:9999;pointer-events:none">
        <div style="font-size:48px;animation:coinDrop 1s ease-out forwards">🪙 +{{ coinAnimation }}</div>
      </div>

      <!-- 每日任务 -->
      <h4 style="margin-bottom:12px">📋 每日任务</h4>
      <div v-if="loading" class="loading-spinner"></div>
      <div v-else>
        <div v-for="t in tasks" :key="t.type" class="card-item" style="cursor:default">
          <span class="menu-item-icon">{{ taskIcon(t.type) }}</span>
          <div class="menu-item-text">
            <div class="menu-item-label">{{ t.description || t.type }}</div>
            <div class="menu-item-desc" v-if="t.progress !== undefined && t.target">
              进度：{{ t.progress }} / {{ t.target }}
            </div>
            <div style="height:4px;background:var(--border);border-radius:2px;margin-top:4px;overflow:hidden">
              <div :style="{height:'100%',background:'var(--primary)',width: (t.progress && t.target) ? (t.progress/t.target*100)+'%' : '0%',transition:'width .3s',borderRadius:'2px'}"></div>
            </div>
          </div>
          <span v-if="t.completed" style="font-size:18px">✅</span>
          <span v-else class="menu-item-arrow" style="font-size:11px">+{{ t.reward || 10 }}🪙</span>
        </div>
      </div>
    </div>
  `
};
