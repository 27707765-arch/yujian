/**
 * 关注列表 - 支持取消关注
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
        const res = await api.get('/user/following');
        if (res.code === 0) list.value = res.data || [];
      } catch (err) { /* */ }
      finally { loading.value = false; }
    });
    async function unfollow(u) {
      if (!confirm('确定取消关注？')) return;
      try {
        await api.post('/match/skip', { target_user_id: u.id });
        toast.success('已取消关注');
        list.value = list.value.filter(item => item.id !== u.id);
      } catch (err) { toast.error(err.message); }
    }
    function viewUser(u) { router.push(`/user/${u.id}`); }
    return { list, loading, viewUser, unfollow };
  },
  template: `
    <div class="page-padding">
      <div v-if="loading" class="text-center" style="padding:32px"><div class="loading-spinner"></div></div>
      <div v-else-if="list.length===0" class="empty-state"><div class="empty-icon">❤️</div><div class="empty-title">暂无关注</div></div>
      <div v-else v-for="u in list" :key="u.id" class="list-item" @click="viewUser(u)">
        <div class="list-item-avatar">
          <img v-if="u.avatar" :src="u.avatar" />
          <span v-else class="flex-center" style="width:100%;height:100%">👤</span>
        </div>
        <div class="list-item-body">
          <div class="list-item-title">{{ u.nickname }}</div>
          <div class="list-item-sub">{{ u.location||'' }}</div>
        </div>
        <button class="btn btn-sm btn-outline" style="color:var(--error);border-color:var(--error)" @click.stop="unfollow(u)">取消关注</button>
      </div>
    </div>
  `
};
