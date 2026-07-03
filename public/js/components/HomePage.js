/**
 * 首页 - 遇见 (推荐列表) 全新视觉
 */
import { ref, reactive, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../utils/api.js';
import { toast } from '../utils/toast.js';
import { isLoggedIn } from '../store/userStore.js';

export default {
  setup() {
    const router = useRouter();
    const users = ref([]);
    const loading = ref(true);
    const error = ref(false);
    const errorMsg = ref('');
    const tab = ref('city');
    const currentCity = ref('');
    const showFilter = ref(false);
    const filterAge = reactive({ min: 18, max: 45 });
    const showMatchModal = ref(false);
    const matchData = ref(null);
    const refreshing = ref(false);
    const pullDistance = ref(0);
    const pullThreshold = 60;
    let touchStartY = 0;

    const cache = reactive({ city: [], nearby: [], cityTime: 0, nearbyTime: 0 });

    async function loadRecommend() {
      loading.value = true; error.value = false;
      const ck = tab.value;
      if (!refreshing.value && cache[ck].length > 0 && (Date.now() - cache[ck + 'Time'] < 300000)) {
        users.value = cache[ck]; loading.value = false; return;
      }
      try {
        const res = await api.get('/match/recommend', { scope: tab.value, ageMin: filterAge.min, ageMax: filterAge.max, limit: 20 });
        if (res.code === 0) { users.value = res.data || []; cache[tab.value] = res.data || []; cache[tab.value + 'Time'] = Date.now(); }
      } catch (err) { error.value = true; errorMsg.value = err.message; }
      finally { loading.value = false; }
    }

    function parseTags(tags) {
      if (!tags) return []; if (Array.isArray(tags)) return tags;
      try { return JSON.parse(tags); } catch (e) { return []; }
    }

    async function initLocation() {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(async (pos) => {
          try { const res = await api.post('/user/location', { lat: pos.coords.latitude, lng: pos.coords.longitude }); if (res.code === 0 && res.data?.city) currentCity.value = res.data.city; } catch (e) {}
          finally { loadRecommend(); }
        }, () => { loadRecommend(); }, { timeout: 8000, enableHighAccuracy: false });
      } else { loadRecommend(); }
    }

    onMounted(() => { if (!isLoggedIn.value) { router.replace('/login'); return; } initLocation(); });

    function switchTab(t) { tab.value = t; loadRecommend(); }

    async function like(user) {
      if (!user) return;
      try {
        const res = await api.post('/match/like', { target_user_id: user.id });
        if (res.data && res.data.matched) {
          matchData.value = { partner: user, conversation_id: res.data.conversation_id, common_tags: res.data.common_tags || [], icebreakers: res.data.icebreakers || [] };
          showMatchModal.value = true;
        }
      } catch (err) { toast.error(err.message); }
      users.value = users.value.filter(u => u.id !== user.id);
    }

    async function skip(user) {
      if (!user) return;
      try { await api.post('/match/skip', { target_user_id: user.id }); } catch (e) {}
      users.value = users.value.filter(u => u.id !== user.id);
    }

    function viewProfile(user) { router.push(`/user/${user.id}`); }
    function closeMatchModal() { showMatchModal.value = false; matchData.value = null; }
    function startChatFromMatch() {
      const convId = matchData.value?.conversation_id; showMatchModal.value = false; matchData.value = null; if (convId) router.push(`/chat/${convId}`);
    }

    function onTouchStart(e) { touchStartY = e.touches[0].clientY; }
    function onTouchMove(e) { if (loading.value) return; const diff = e.touches[0].clientY - touchStartY; const el = document.querySelector('.page-content'); if (el && el.scrollTop > 5) { pullDistance.value = 0; return; } if (diff > 0) { pullDistance.value = Math.min(diff * 0.4, 100); } }
    function onTouchEnd() { if (pullDistance.value >= pullThreshold && !loading.value) { refreshing.value = true; loadRecommend().finally(() => { refreshing.value = false; pullDistance.value = 0; }); } else { pullDistance.value = 0; } }
    const pullHint = computed(() => { if (refreshing.value) return '🔄 刷新中...'; if (pullDistance.value >= pullThreshold) return '松手刷新'; return '↓ 下拉刷新'; });

    return {
      users, loading, error, errorMsg, tab, currentCity, showFilter, filterAge,
      showMatchModal, matchData, refreshing, pullDistance, pullHint,
      switchTab, like, skip, viewProfile, loadRecommend, parseTags,
      closeMatchModal, startChatFromMatch, onTouchStart, onTouchMove, onTouchEnd, router
    };
  },
  template: `
    <div class="page-padding" @touchstart="onTouchStart" @touchmove="onTouchMove" @touchend="onTouchEnd">
      <!-- 下拉刷新 -->
      <div v-if="pullDistance>0" :style="{textAlign:'center',height:pullDistance+'px',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'13px',color:'var(--primary)',transition:refreshing?'none':'height .2s'}">{{ pullHint }}</div>

      <!-- 顶部Tab -->
      <div style="display:flex;gap:4px;background:#F2F2F7;border-radius:14px;padding:4px;margin-bottom:16px">
        <button @click="switchTab('city')" :style="tab==='city'?{flex:1,padding:'10px',borderRadius:'11px',border:'none',fontSize:'14px',fontWeight:700,cursor:'pointer',background:'#FFF',color:'#FF5E7D',boxShadow:'0 2px 8px rgba(0,0,0,.08)'}:{flex:1,padding:'10px',borderRadius:'11px',border:'none',fontSize:'14px',fontWeight:500,cursor:'pointer',background:'transparent',color:'#86868B'}">
          {{ currentCity ? '🏙 '+currentCity : '🏙 同城' }}
        </button>
        <button @click="switchTab('nearby')" :style="tab==='nearby'?{flex:1,padding:'10px',borderRadius:'11px',border:'none',fontSize:'14px',fontWeight:700,cursor:'pointer',background:'#FFF',color:'#FF5E7D',boxShadow:'0 2px 8px rgba(0,0,0,.08)'}:{flex:1,padding:'10px',borderRadius:'11px',border:'none',fontSize:'14px',fontWeight:500,cursor:'pointer',background:'transparent',color:'#86868B'}">
          📍 附近
        </button>
      </div>

      <!-- 操作栏 -->
      <div style="display:flex;gap:8px;margin-bottom:12px">
        <button class="btn btn-sm btn-outline" @click="showFilter=!showFilter" style="border-color:#E5E5EA;color:#86868B">🔍 筛选</button>
        <button class="btn btn-sm btn-outline" @click="router.push('/search')" style="border-color:#E5E5EA;color:#86868B">🔎 搜索</button>
      </div>

      <!-- 筛选面板 -->
      <div v-if="showFilter" :style="{background:'#FFF',padding:'16px',borderRadius:'16px',marginBottom:'12px',boxShadow:'0 4px 16px rgba(0,0,0,.06)'}">
        <div style="display:flex;gap:12px;align-items:center;margin-bottom:12px;font-size:13px;color:#86868B">
          年龄：<input v-model.number="filterAge.min" type="number" min="18" max="80" style="width:56px;padding:8px;border:2px solid #E5E5EA;border-radius:8px;text-align:center" /> - <input v-model.number="filterAge.max" type="number" min="18" max="80" style="width:56px;padding:8px;border:2px solid #E5E5EA;border-radius:8px;text-align:center" />
        </div>
        <button class="btn btn-primary btn-sm btn-block" @click="loadRecommend();showFilter=false">应用筛选</button>
      </div>

      <!-- 骨架屏 -->
      <div v-if="loading">
        <div v-for="i in 3" :key="'sk'+i" style="background:#FFF;border-radius:20px;padding:20px;margin-bottom:12px;display:flex;gap:16px;align-items:center;box-shadow:0 2px 8px rgba(0,0,0,.04)">
          <div class="skeleton skeleton-avatar" style="width:56px;height:56px"></div>
          <div style="flex:1"><div class="skeleton skeleton-text" style="width:50%"></div><div class="skeleton skeleton-text-short"></div></div>
          <div style="display:flex;flex-direction:column;gap:8px"><div class="skeleton" style="width:40px;height:40px;border-radius:50%"></div><div class="skeleton" style="width:40px;height:40px;border-radius:50%"></div></div>
        </div>
      </div>

      <!-- 错误 -->
      <div v-else-if="error" class="error-state">
        <div class="error-icon">😵</div><div class="error-message">{{ errorMsg }}</div>
        <button class="btn btn-primary btn-sm" @click="loadRecommend">重试</button>
      </div>

      <!-- 空 -->
      <div v-else-if="users.length===0" class="empty-state">
        <div class="empty-icon">🔍</div><div class="empty-title">{{ tab==='city'?'暂无同城用户':'暂无附近用户' }}</div>
        <div class="empty-desc">换个时间再来或调整筛选条件</div>
        <button class="btn btn-primary btn-sm" @click="loadRecommend">刷新</button>
      </div>

      <!-- 用户列表 -->
      <div v-else style="display:flex;flex-direction:column;gap:12px">
        <div v-for="user in users" :key="user.id" @click="viewProfile(user)"
          style="background:#FFF;border-radius:20px;padding:18px;display:flex;align-items:center;gap:14px;box-shadow:0 2px 12px rgba(0,0,0,.04);cursor:pointer;transition:all .2s">
          <!-- 头像 -->
          <div :style="{width:'56px',height:'56px',borderRadius:'50%',overflow:'hidden',flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center',background:'linear-gradient(135deg,#E8E8ED,#D1D1D6)',border:user.is_vip?'2px solid #FFD60A':'none'}">
            <img v-if="user.avatar" :src="user.avatar" style="width:100%;height:100%;object-fit:cover" />
            <span v-else style="font-size:26px">👤</span>
          </div>
          <!-- 信息 -->
          <div style="flex:1;min-width:0">
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
              <span style="font-size:16px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:120px">{{ user.nickname||'TA' }}</span>
              <span style="font-size:13px;color:#86868B">{{ user.age||'?' }}岁</span>
              <span v-if="user.is_vip" style="font-size:11px;background:linear-gradient(135deg,#FFD60A,#FFAA00);color:#FFF;padding:2px 8px;border-radius:10px;font-weight:700">VIP</span>
            </div>
            <div style="display:flex;align-items:center;gap:4px;font-size:12px;color:#AEAEB2;margin-bottom:6px">
              <span>{{ !user._distance_hidden&&user.distance ? user.distance.toFixed(1)+'km' : (tab==='city'?'同城':'附近') }}</span>
              <span v-if="user.occupation">· {{ user.occupation }}</span>
            </div>
            <div v-if="parseTags(user.tags).length" style="display:flex;gap:5px;flex-wrap:wrap">
              <span v-for="t in parseTags(user.tags).slice(0,3)" :key="t" style="font-size:11px;padding:3px 10px;border-radius:10px;color:#FF5E7D;background:#FFF0F3;font-weight:500">{{ t }}</span>
            </div>
          </div>
          <!-- 操作 -->
          <div style="display:flex;flex-direction:column;gap:10px;flex-shrink:0">
            <button @click.stop="skip(user)" style="width:40px;height:40px;borderRadius:50%;border:2px solid #E5E5EA;background:#FFF;font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center;color:#AEAEB2">✕</button>
            <button @click.stop="like(user)" style="width:40px;height:40px;borderRadius:50%;border:none;background:linear-gradient(135deg,#FF5E7D,#FF3B5C);color:#FFF;font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 12px rgba(255,94,125,.35)">♥</button>
          </div>
        </div>
      </div>

      <!-- 匹配弹窗 -->
      <div v-if="showMatchModal" class="match-modal" @click.self="closeMatchModal">
        <div class="match-modal-content" style="border-radius:24px;padding:36px 28px">
          <div style="font-size:56px;margin-bottom:8px">💕</div>
          <h3 style="font-size:26px;font-weight:800;margin-bottom:4px;color:#1D1D1F">匹配成功！</h3>
          <p style="font-size:14px;color:#86868B;margin-bottom:20px">你和 <b>{{ matchData?.partner?.nickname||'TA' }}</b> 互相喜欢</p>
          <div v-if="matchData?.common_tags?.length" style="display:flex;gap:6px;flex-wrap:wrap;justify-content:center;margin-bottom:16px">
            <span v-for="t in matchData.common_tags" :key="t" style="font-size:12px;padding:4px 12px;border-radius:12px;background:#FFF0F3;color:#FF5E7D">#{{ t }}</span>
          </div>
          <div v-if="matchData?.icebreakers?.length" style="text-align:left;margin-bottom:20px">
            <p style="font-size:12px;color:#AEAEB2;margin-bottom:8px">💡 试试这些破冰话题：</p>
            <div v-for="(t,i) in matchData.icebreakers" :key="i" style="padding:10px 14px;background:#F5F5F7;border-radius:12px;margin-bottom:6px;font-size:13px">💬 {{ t }}</div>
          </div>
          <button class="btn btn-primary btn-block btn-lg" @click="startChatFromMatch">💬 开始聊天</button>
          <button class="btn btn-ghost btn-block" style="margin-top:8px" @click="closeMatchModal">稍后再说</button>
        </div>
      </div>
    </div>
  `
};
