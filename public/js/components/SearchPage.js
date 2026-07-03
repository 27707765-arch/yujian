/**
 * 用户搜索页
 */
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../utils/api.js';
import { isLoggedIn } from '../store/userStore.js';
const HISTORY_KEY = 'search_history';
export default {
  setup() {
    const router = useRouter();
    const query = ref('');
    const results = ref([]);
    const searching = ref(false);
    const searched = ref(false);
    const history = ref([]);
    function loadHistory() {
      try { history.value = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch(e) { history.value = []; }
    }
    onMounted(() => {
      if (!isLoggedIn.value) { router.replace('/login'); return; }
      loadHistory();
    });
    function saveHistory(q) {
      if (!q.trim()) return;
      history.value = [q, ...history.value.filter(h => h !== q)].slice(0, 10);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history.value));
    }
    function clearHistory() { history.value = []; localStorage.removeItem(HISTORY_KEY); }
    async function doSearch() {
      const q = query.value.trim();
      if (!q) return;
      searching.value = true; searched.value = false;
      try {
        const res = await api.get('/user/search', { q, tags: q });
        if (res.code === 0) { results.value = res.data || []; searched.value = true; }
        saveHistory(q);
      } catch (e) { }
      finally { searching.value = false; }
    }
    function onHistoryClick(h) { query.value = h; doSearch(); }
    function viewUser(id) { router.push(`/user/${id}`); }
    return { query, results, searching, searched, history, doSearch, onHistoryClick, clearHistory, viewUser };
  },
  template: `
    <div class="page-padding">
      <!-- 搜索栏 -->
      <div class="info-row" style="margin-bottom:16px;gap:8px">
        <div class="input-group" style="flex:1;border-radius:24px">
          <input v-model="query" placeholder="搜索用户昵称..." @keydown.enter="doSearch" />
        </div>
        <button class="btn btn-primary btn-sm" @click="doSearch" :disabled="searching">搜索</button>
      </div>
      <!-- 搜索历史 -->
      <div v-if="!searched && history.length" style="margin-bottom:16px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <span style="font-size:13px;color:var(--text-muted)">搜索历史</span>
          <button @click="clearHistory" style="border:none;background:none;font-size:12px;color:var(--text-muted);cursor:pointer">清空</button>
        </div>
        <div class="tag-row">
          <span v-for="h in history" :key="h" class="tag" style="cursor:pointer" @click="onHistoryClick(h)">{{ h }}</span>
        </div>
      </div>
      <!-- 加载 -->
      <div v-if="searching" class="text-center" style="padding:32px"><div class="loading-spinner"></div></div>
      <!-- 空结果 -->
      <div v-else-if="searched && results.length === 0" class="empty-state">
        <div class="empty-icon">🔍</div><div class="empty-title">未找到相关用户</div><div class="empty-desc">试试其他关键词</div>
      </div>
      <!-- 结果列表 -->
      <div v-else-if="searched && results.length > 0">
        <div v-for="u in results" :key="u.id" class="list-item" @click="viewUser(u.id)">
          <div class="list-item-avatar">
            <img v-if="u.avatar" :src="u.avatar" />
            <span v-else class="flex-center" style="width:100%;height:100%">👤</span>
          </div>
          <div class="list-item-body">
            <div class="info-row">
              <span class="list-item-title">{{ u.nickname }}</span>
              <span style="font-size:12px;color:var(--text-muted)">{{ u.age ? u.age+'岁' : '' }}</span>
            </div>
            <div class="list-item-sub">{{ u.location || '' }}{{ u.occupation ? ' · ' + u.occupation : '' }}</div>
          </div>
        </div>
      </div>
    </div>
  `
};
