/**
 * 我的遇见 - 看过我的/喜欢我的/互相喜欢
 */
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../utils/api.js';
import { toast } from '../utils/toast.js';

export default {
  setup() {
    const router = useRouter();
    const tab = ref('viewers');
    const list = ref([]);
    const loading = ref(true);

    async function load(t) {
      tab.value = t; loading.value = true;
      try {
        let endpoint;
        if (t === 'viewers') endpoint = '/user/viewers';
        else if (t === 'fans') endpoint = '/user/fans';
        else endpoint = '/match/matches';
        const res = await api.get(endpoint);
        if (res.code === 0) list.value = res.data || [];
      } catch (err) { /* */ }
      finally { loading.value = false; }
    }

    async function likeBack(u) {
      try {
        await api.post('/match/like', { target_user_id: u.id });
        toast.success('已喜欢');
        list.value = list.value.filter(item => item.id !== u.id);
      } catch (err) { toast.error(err.message); }
    }

    function viewUser(u) { router.push(`/user/${u.id}`); }
    function startChat(u) { router.push(`/chat/u?user_id=${u.id}`); }
    function timeAgo(t) {
      const d = Math.floor((Date.now() - new Date(t).getTime()) / 1000);
      if (d < 3600) return Math.floor(d/60) + '分钟前';
      if (d < 86400) return Math.floor(d/3600) + '小时前';
      return Math.floor(d/86400) + '天前';
    }

    onMounted(() => load('viewers'));
    return { tab, list, loading, load, likeBack, viewUser, startChat, timeAgo };
  },
  template: `
    <div class="page-padding">
      <div class="tab-bar">
        <button class="btn btn-sm" :class="tab==='viewers'?'btn-primary':'btn-outline'" @click="load('viewers')">看过我的</button>
        <button class="btn btn-sm" :class="tab==='fans'?'btn-primary':'btn-outline'" @click="load('fans')">喜欢我的</button>
        <button class="btn btn-sm" :class="tab==='matches'?'btn-primary':'btn-outline'" @click="load('matches')">互相喜欢</button>
      </div>
      <div v-if="loading" class="text-center" style="padding:32px"><div class="loading-spinner"></div></div>
      <div v-else-if="list.length===0" class="empty-state"><div class="empty-icon">🔍</div><div class="empty-title">暂无数据</div></div>
      <div v-else v-for="item in list" :key="item.id" class="list-item" @click="viewUser(item)">
        <div class="list-item-avatar">
          <img v-if="item.avatar" :src="item.avatar" />
          <span v-else class="flex-center" style="width:100%;height:100%">👤</span>
        </div>
        <div class="list-item-body">
          <div class="list-item-title">{{ item.nickname }}</div>
          <div class="list-item-sub">
            <span v-if="item.age">{{ item.age }}岁 </span>
            <span v-if="item.location">{{ item.location }}</span>
            <span v-if="item.viewed_at" class="text-muted" style="margin-left:8px">{{ timeAgo(item.viewed_at || item.created_at) }}{{ tab==='viewers' ? '看过你' : '喜欢了你' }}</span>
            <span v-if="item.common_tags" style="font-size:11px;color:var(--primary)"> · {{ item.common_tags }}个共同标签</span>
          </div>
        </div>
        <!-- 操作按钮 -->
        <button v-if="tab==='viewers'" class="btn btn-sm btn-primary" @click.stop="likeBack(item)">喜欢TA</button>
        <button v-if="tab==='fans'" class="btn btn-sm btn-primary" @click.stop="likeBack(item)">回关</button>
        <button v-if="tab==='matches'" class="btn btn-sm btn-primary" @click.stop="startChat(item)">💬 发消息</button>
      </div>
    </div>
  `
};
