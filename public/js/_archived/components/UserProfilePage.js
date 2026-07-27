/**
 * 用户资料页 - 查看他人主页
 * 支持动态/粉丝数显示 + 操作菜单（举报/拉黑）
 */
import { ref, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '../utils/api.js';
import { toast } from '../utils/toast.js';

export default {
  setup() {
    const route = useRoute();
    const router = useRouter();
    const userId = ref(parseInt(route.params.id));
    const profile = ref(null);
    const loading = ref(true);
    const showMenu = ref(false);
    const showReportModal = ref(false);
    const reportReason = ref('');
    const reportDesc = ref('');
    const reportReasons = ['色情低俗', '欺诈诈骗', '骚扰辱骂', '虚假信息', '其他'];

    async function loadProfile() {
      loading.value = true;
      try {
        const res = await api.get(`/user/profile/${userId.value}`);
        if (res.code === 0) profile.value = res.data;
      } catch (err) { toast.error('加载失败'); }
      finally { loading.value = false; }
    }

    onMounted(loadProfile);

    async function likeUser() {
      try {
        const res = await api.post('/match/like', { target_user_id: userId.value });
        if (res.data && res.data.matched) { toast.success('💕 匹配成功！'); }
        else { toast.success('已喜欢'); }
      } catch (err) { toast.error(err.message); }
    }

    async function startChat() {
      try {
        const res = await api.post('/chat/conversations', { target_user_id: userId.value });
        if (res.code === 0 && res.data) {
          router.push(`/chat/${res.data.id}`);
        }
      } catch (err) { toast.error(err.message); }
    }

    async function blockUser() {
      if (!confirm('确定拉黑该用户？拉黑后将无法收到对方的消息和动态')) return;
      try {
        await api.post('/block/add', { blocked_user_id: userId.value });
        toast.success('已拉黑');
        router.back();
      } catch (err) { toast.error(err.message); }
    }

    async function submitReport() {
      if (!reportReason.value) { toast.warning('请选择举报原因'); return; }
      try {
        await api.post('/report/submit', {
          target_user_id: userId.value,
          reason: reportReason.value,
          description: reportDesc.value || undefined
        });
        toast.success('举报已提交');
        showReportModal.value = false;
        showMenu.value = false;
        reportReason.value = '';
        reportDesc.value = '';
      } catch (err) { toast.error(err.message); }
    }

    return { profile, loading, showMenu, showReportModal, reportReason, reportDesc, reportReasons,
      likeUser, startChat, blockUser, submitReport };
  },
  template: `
    <div>
      <div v-if="loading">
        <div style="text-align:center;padding:48px">
          <div class="skeleton skeleton-avatar avatar-xl" style="margin:0 auto"></div>
          <div class="skeleton skeleton-text" style="width:40%;margin:16px auto"></div>
          <div class="skeleton skeleton-text-short" style="margin:0 auto"></div>
          <div class="skeleton skeleton-text" style="width:80%;margin:16px auto"></div>
        </div>
      </div>
      <div v-else-if="!profile" class="empty-state"><div class="empty-icon">😕</div><div class="empty-title">用户不存在</div></div>
      <div v-else>
        <!-- 头像+基本信息 -->
        <div class="gradient-header-purple" style="position:relative">
          <!-- 操作菜单按钮 -->
          <button @click="showMenu = true" style="position:absolute;top:12px;right:16px;width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,.2);color:#fff;border:none;font-size:20px;cursor:pointer;display:flex;align-items:center;justify-content:center">⋮</button>
          <div :class="['avatar-circle avatar-xl', profile.is_vip ? 'avatar-vip' : '']" style="margin:0 auto;background:rgba(255,255,255,.3);border:3px solid rgba(255,255,255,.5)">
            <img v-if="profile.avatar" :src="profile.avatar" />
            <span v-else class="avatar-default" style="font-size:36px">👤</span>
          </div>
          <div style="font-size:22px;font-weight:600;margin-top:12px">{{ profile.nickname }}</div>
          <div style="font-size:14px;opacity:.8;margin-top:4px">
            {{ profile.age ? profile.age + '岁' : '' }} {{ profile.occupation || '' }} {{ profile.location || '' }}
          </div>
          <div class="stat-bar">
            <div class="stat-item">
              <span class="stat-number">{{ profile.posts_count || 0 }}</span>
              <span class="stat-label">动态</span>
            </div>
            <div class="stat-item">
              <span class="stat-number">{{ profile.fans_count || 0 }}</span>
              <span class="stat-label">粉丝</span>
            </div>
            <div class="stat-item">
              <span class="stat-number">{{ profile.gifts_received_count || 0 }}</span>
              <span class="stat-label">礼物</span>
            </div>
          </div>
        </div>

        <!-- 个人简介 -->
        <div class="profile-section">
          <h4>个人简介</h4>
          <p style="line-height:1.6">{{ profile.bio || 'TA还没有写个人简介' }}</p>
        </div>

        <!-- 标签 -->
        <div v-if="profile.tags" class="profile-section">
          <h4>兴趣标签</h4>
          <div class="tag-row">
            <span v-for="t in (typeof profile.tags === 'string' ? JSON.parse(profile.tags) : profile.tags)" :key="t" class="tag tag-primary">{{ t }}</span>
          </div>
        </div>

        <!-- 操作按钮 -->
        <div class="profile-actions">
          <button class="btn btn-outline btn-block" @click="likeUser">♥ 喜欢</button>
          <button class="btn btn-primary btn-block" @click="startChat">💬 发消息</button>
        </div>

        <!-- 底部操作菜单 -->
        <div v-if="showMenu" class="match-modal" @click.self="showMenu = false">
          <div style="background:var(--bg-white);border-radius:16px 16px 0 0;width:100%;padding:20px 16px;padding-bottom:calc(20px + env(safe-area-inset-bottom, 0px));animation:slideUp .3s ease-out">
            <h4 style="margin-bottom:16px;text-align:center">操作</h4>
            <div @click="showReportModal = true; showMenu = false" class="card-item" style="color:var(--text)">🚩 举报</div>
            <div @click="blockUser()" class="card-item" style="color:var(--error)">🚫 拉黑</div>
            <button class="btn btn-outline btn-block mt-12" @click="showMenu = false">取消</button>
          </div>
        </div>

        <!-- 举报弹窗 -->
        <div v-if="showReportModal" class="match-modal" @click.self="showReportModal = false">
          <div style="background:var(--bg-white);border-radius:16px;width:calc(100% - 48px);max-width:360px;padding:24px 20px">
            <h4 style="margin-bottom:16px;text-align:center">举报用户</h4>
            <div v-for="r in reportReasons" :key="r" style="margin-bottom:8px">
              <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:14px">
                <input type="radio" :value="r" v-model="reportReason" style="accent-color:var(--primary)" /> {{ r }}
              </label>
            </div>
            <div class="input-group" style="margin:12px 0">
              <input v-model="reportDesc" placeholder="补充说明（选填）" />
            </div>
            <div style="display:flex;gap:8px">
              <button class="btn btn-outline" style="flex:1" @click="showReportModal = false">取消</button>
              <button class="btn btn-primary" style="flex:1" @click="submitReport">提交举报</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `
};
