/**
 * 粉丝列表 - 支持回关
 */
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../utils/api.js';
import { toast } from '../utils/toast.js';
export default {
  setup() {
    const router = useRouter();
    const list = ref([]);
    const loading = ref(true);
    onMounted(async () => {
      try {
        const res = await api.get('/user/fans');
        if (res.code === 0) list.value = (res.data || []).map(u => ({ ...u, following: false }));
      } catch (err) { /* */ }
      finally { loading.value = false; }
    });
    async function followBack(u) {
      if (u.following) return;
      try {
        await api.post('/match/like', { target_user_id: u.id });
        u.following = true;
        toast.success('已回关');
      } catch (err) { toast.error(err.message); }
    }
    function viewUser(u) { router.push(`/user/${u.id}`); }
    return { list, loading, viewUser, followBack };
  },
  template: `
    <div class="page-padding">
      <div v-if="loading" class="text-center" style="padding:32px"><div class="loading-spinner"></div></div>
      <div v-else-if="list.length===0" class="empty-state"><div class="empty-icon">👥</div><div class="empty-title">暂无粉丝</div></div>
      <div v-else v-for="u in list" :key="u.id" class="list-item" @click="viewUser(u)">
        <div class="list-item-avatar">
          <img v-if="u.avatar" :src="u.avatar" />
          <span v-else class="flex-center" style="width:100%;height:100%">👤</span>
        </div>
        <div class="list-item-body">
          <div class="list-item-title">{{ u.nickname }}</div>
          <div class="list-item-sub">{{ u.location||'' }}</div>
        </div>
        <button v-if="!u.following" class="btn btn-sm btn-primary" @click.stop="followBack(u)">回关</button>
        <span v-else class="tag" style="background:var(--bg-page);color:var(--text-muted)">已关注</span>
      </div>
    </div>
  `
};
