/**
 * 动态页 - 帖子信息流 (全新视觉)
 */
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../utils/api.js';
import { toast } from '../utils/toast.js';
import { isLoggedIn } from '../store/userStore.js';

export default {
  setup() {
    const router = useRouter();
    const posts = ref([]);
    const loading = ref(true);
    const error = ref(false);
    const tab = ref('following');
    const refreshing = ref(false);
    const pullDistance = ref(0);
    const pullThreshold = 60;
    let touchStartY = 0;

    async function loadPosts() {
      loading.value = true; error.value = false;
      try {
        const params = { limit: 20 };
        if (tab.value === 'following') params.scope = 'following';
        else if (tab.value === 'nearby') params.scope = 'nearby';
        const res = await api.get('/posts', params);
        if (res.code === 0) posts.value = res.data || [];
      } catch (err) { error.value = true; }
      finally { loading.value = false; }
    }

    onMounted(() => { if (!isLoggedIn.value) { router.replace('/login'); return; } loadPosts(); });

    function switchTab(t) { tab.value = t; loadPosts(); }

    async function toggleLike(post, event) {
      try {
        if (event?.target) { event.target.classList.add('heart-anim'); event.target.addEventListener('animationend', function() { this.classList.remove('heart-anim'); }, { once: true }); }
        if (navigator.vibrate) { navigator.vibrate(50); }
        await api.post(`/posts/${post.id}/like`);
        post.liked = !post.liked; post.like_count += post.liked ? 1 : -1; if (post.like_count < 0) post.like_count = 0;
      } catch (err) { toast.error(err.message); }
    }

    function viewPost(post) { router.push(`/post/${post.id}`); }
    function timeAgo(t) {
      if (!t) return ''; const d = Math.floor((Date.now() - new Date(t).getTime()) / 1000);
      if (d < 60) return '刚刚'; if (d < 3600) return Math.floor(d / 60) + '分钟前'; if (d < 86400) return Math.floor(d / 3600) + '小时前';
      return Math.floor(d / 86400) + '天前';
    }

    function onTouchStart(e) { touchStartY = e.touches[0].clientY; }
    function onTouchMove(e) { if (loading.value) return; const diff = e.touches[0].clientY - touchStartY; const el = document.querySelector('.page-content'); if (el && el.scrollTop > 5) { pullDistance.value = 0; return; } if (diff > 0) { pullDistance.value = Math.min(diff * 0.4, 100); } }
    function onTouchEnd() { if (pullDistance.value >= pullThreshold && !loading.value) { refreshing.value = true; loadPosts().finally(() => { refreshing.value = false; pullDistance.value = 0; }); } else { pullDistance.value = 0; } }
    const pullHint = computed(() => { if (refreshing.value) return '🔄 刷新中...'; if (pullDistance.value >= pullThreshold) return '松手刷新'; return '↓ 下拉刷新'; });

    return { posts, loading, error, tab, router, refreshing, pullDistance, pullHint,
      switchTab, toggleLike, viewPost, timeAgo, onTouchStart, onTouchMove, onTouchEnd };
  },
  template: `
    <div class="page-padding" @touchstart="onTouchStart" @touchmove="onTouchMove" @touchend="onTouchEnd">
      <div v-if="pullDistance>0" :style="{textAlign:'center',height:pullDistance+'px',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'13px',color:'var(--primary)'}">{{ pullHint }}</div>

      <!-- Tab -->
      <div style="display:flex;gap:4px;background:#F2F2F7;border-radius:14px;padding:4px;margin-bottom:20px">
        <button @click="switchTab('following')" :style="tab==='following'?{flex:1,padding:'10px',borderRadius:'11px',border:'none',fontSize:'14px',fontWeight:700,cursor:'pointer',background:'#FFF',color:'#1D1D1F',boxShadow:'0 2px 8px rgba(0,0,0,.06)'}:{flex:1,padding:'10px',borderRadius:'11px',border:'none',fontSize:'14px',fontWeight:500,cursor:'pointer',background:'transparent',color:'#86868B'}">关注</button>
        <button @click="switchTab('nearby')" :style="tab==='nearby'?{flex:1,padding:'10px',borderRadius:'11px',border:'none',fontSize:'14px',fontWeight:700,cursor:'pointer',background:'#FFF',color:'#1D1D1F',boxShadow:'0 2px 8px rgba(0,0,0,.06)'}:{flex:1,padding:'10px',borderRadius:'11px',border:'none',fontSize:'14px',fontWeight:500,cursor:'pointer',background:'transparent',color:'#86868B'}">附近</button>
        <button @click="router.push('/create-post')" style="padding:10px 16px;border-radius:11px;border:none;fontSize:14px;fontWeight:600;cursor:pointer;background:linear-gradient(135deg,#FF5E7D,#FF8099);color:#FFF">➕ 发动态</button>
      </div>

      <!-- 骨架 -->
      <div v-if="loading">
        <div v-for="i in 3" :key="'sk'+i" style="background:#FFF;border-radius:20px;padding:20px;margin-bottom:14px;box-shadow:0 2px 8px rgba(0,0,0,.04)">
          <div style="display:flex;gap:12px;align-items:center;margin-bottom:16px">
            <div class="skeleton" style="width:36px;height:36px;border-radius:50%"></div>
            <div style="flex:1"><div class="skeleton skeleton-text" style="width:30%"></div></div>
          </div>
          <div class="skeleton skeleton-text" style="width:85%"></div>
          <div class="skeleton skeleton-text-short"></div>
        </div>
      </div>

      <!-- 错误 -->
      <div v-else-if="error" class="error-state">
        <div class="error-icon">😵</div><div class="error-message">加载失败</div>
        <button class="btn btn-primary btn-sm" @click="loadPosts">重试</button>
      </div>

      <!-- 空 -->
      <div v-else-if="posts.length===0" class="empty-state">
        <div class="empty-icon">📝</div>
        <div class="empty-title">{{ tab==='following'?'还没有关注任何人':'附近暂无动态' }}</div>
      </div>

      <!-- 动态列表 -->
      <div v-else style="display:flex;flex-direction:column;gap:14px">
        <div v-for="post in posts" :key="post.id" @click="viewPost(post)"
          style="background:#FFF;border-radius:20px;padding:20px;box-shadow:0 2px 12px rgba(0,0,0,.04);cursor:pointer">
          <!-- 头部 -->
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">
            <div style="width:36px;height:36px;border-radius:50%;overflow:hidden;background:linear-gradient(135deg,#E8E8ED,#D1D1D6);display:flex;align-items:center;justify-content:center;flex-shrink:0">
              <img v-if="post.avatar" :src="post.avatar" style="width:100%;height:100%;object-fit:cover" />
              <span v-else style="font-size:16px">👤</span>
            </div>
            <div>
              <div style="font-size:14px;font-weight:700;color:#1D1D1F">{{ post.nickname||'用户' }}</div>
              <div style="font-size:12px;color:#AEAEB2">{{ timeAgo(post.created_at) }}</div>
            </div>
          </div>
          <!-- 正文 -->
          <p v-if="post.content" style="font-size:15px;line-height:1.65;color:#1D1D1F;margin-bottom:12px;white-space:pre-wrap">{{ post.content }}</p>
          <!-- 图片 -->
          <div v-if="post.images&&post.images.length" :style="{display:'grid',gridTemplateColumns:'repeat('+Math.min(post.images.length,3)+',1fr)',gap:'4px',marginBottom:'12px'}">
            <img v-for="(img,i) in post.images.slice(0,9)" :key="i" :src="img" style="width:100%;aspect-ratio:1;object-fit:cover;border-radius:8px" />
          </div>
          <!-- 操作栏 -->
          <div style="display:flex;gap:28px;font-size:13px;color:#86868B;padding-top:4px">
            <span @click.stop="toggleLike(post,$event)" :style="{color:post.liked?'#FF5E7D':'',cursor:'pointer'}">{{ post.liked?'❤️':'🤍' }} {{ post.like_count||'' }}</span>
            <span>💬 {{ post.comment_count||'' }}</span>
          </div>
        </div>
      </div>
    </div>
  `
};
