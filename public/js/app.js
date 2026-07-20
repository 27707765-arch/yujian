/**
 * 遇见APP - Vue 3 应用入口
 * CDN ESM 方式加载
 */
import { createApp, h } from 'vue';
import { createRouter, createWebHashHistory } from 'vue-router';
import { isLoggedIn } from './store/userStore.js';
import { state as uiState, setNavVisibility, setBackButton, clearBackButton, setPageTitle } from './store/uiStore.js';
import { state as chatState } from './store/chatStore.js';
import { toasts } from './utils/toast.js';
import { wsState } from './utils/websocket.js';

// ============ 页面组件导入 ============
import WelcomePage from './components/WelcomePage.js';
import LoginPage from './components/LoginPage.js';
import HomePage from './components/HomePage.js';
import DiscoverPage from './components/DiscoverPage.js';
import ChatListPage from './components/ChatListPage.js';
import ChatDetailPage from './components/ChatDetailPage.js';
import PostDetailPage from './components/PostDetailPage.js';
import UserProfilePage from './components/UserProfilePage.js';
import EditProfilePage from './components/EditProfilePage.js';
import VipPage from './components/VipPage.js';
import SettingsPage from './components/SettingsPage.js';
import MyPage from './components/MyPage.js';
import MeetPage from './components/MeetPage.js';
import RechargePage from './components/RechargePage.js';
import EarningsPage from './components/EarningsPage.js';
import FansPage from './components/FansPage.js';
import FollowingPage from './components/FollowingPage.js';
import CreatePostPage from './components/CreatePostPage.js';
import CheckinPage from './components/CheckinPage.js';
import PrivacySettingsPage from './components/PrivacySettingsPage.js';
import NotifySettingsPage from './components/NotifySettingsPage.js';
import AboutPage from './components/AboutPage.js';
import FeedbackPage from './components/FeedbackPage.js';
import LegalPage from './components/LegalPage.js';
import SearchPage from './components/SearchPage.js';
import OnboardingPage from './components/OnboardingPage.js';
import ImagePreview, { openImagePreview, closeImagePreview } from './components/ImagePreview.js';

const NAV_PAGES = ['/home', '/discover', '/chat', '/my'];

const routes = [
  { path: '/', component: WelcomePage, meta: { title: '' } },
  { path: '/login', component: LoginPage, meta: { title: '' } },
  { path: '/home', component: HomePage, meta: { title: '遇见', nav: true } },
  { path: '/discover', component: DiscoverPage, meta: { title: '动态', nav: true } },
  { path: '/chat', component: ChatListPage, meta: { title: '消息', nav: true } },
  { path: '/chat/:id', component: ChatDetailPage, meta: { title: '聊天' } },
  { path: '/post/:id', component: PostDetailPage, meta: { title: '动态详情' } },
  { path: '/user/:id', component: UserProfilePage, meta: { title: '个人主页' } },
  { path: '/edit-profile', component: EditProfilePage, meta: { title: '编辑资料', auth: true } },
  { path: '/vip', component: VipPage, meta: { title: '会员中心', auth: true } },
  { path: '/settings', component: SettingsPage, meta: { title: '设置' } },
  { path: '/my', component: MyPage, meta: { title: '我的', nav: true } },
  { path: '/meet', component: MeetPage, meta: { title: '我的遇见', auth: true } },
  { path: '/recharge', component: RechargePage, meta: { title: '金币充值', auth: true } },
  { path: '/earnings', component: EarningsPage, meta: { title: '我的收益', auth: true } },
  { path: '/fans', component: FansPage, meta: { title: '粉丝', auth: true } },
  { path: '/following', component: FollowingPage, meta: { title: '关注', auth: true } },
  { path: '/create-post', component: CreatePostPage, meta: { title: '发动态', auth: true } },
  { path: '/checkin', component: CheckinPage, meta: { title: '签到', auth: true } },
  { path: '/privacy-settings', component: PrivacySettingsPage, meta: { title: '隐私设置', auth: true } },
  { path: '/notify-settings', component: NotifySettingsPage, meta: { title: '通知设置', auth: true } },
  { path: '/about', component: AboutPage, meta: { title: '关于' } },
  { path: '/feedback', component: FeedbackPage, meta: { title: '意见反馈', auth: true } },
  { path: '/legal/:type', component: LegalPage, meta: { title: '协议' } },
  { path: '/search', component: SearchPage, meta: { title: '搜索', auth: true } },
  { path: '/onboarding', component: OnboardingPage, meta: { title: '完善资料' } }
];

const router = createRouter({
  history: createWebHashHistory(),
  routes
});

router.beforeEach((to, from, next) => {
  document.title = to.meta.title ? `${to.meta.title} - 遇见` : '遇见';
  setPageTitle(to.meta.title || '');
  setNavVisibility(NAV_PAGES.includes(to.path));

  if (to.path !== '/' && to.path !== '/home' && to.path !== '/login') {
    setBackButton(() => {
      if (from.path && from.path !== to.path) { router.back(); }
      else { router.replace('/home'); }
    });
  } else {
    clearBackButton();
  }

  if (to.meta.auth && !isLoggedIn.value) {
    next('/login');
    return;
  }
  next();
});

window.addEventListener('auth:expired', () => router.push('/login'));

// 根组件 - 包含 Header / Nav / Toast / Loading（直接在 render 中组合）
const AppRoot = {
  setup() {
    function goBack() {
      if (uiState.backAction) { uiState.backAction(); }
      else { router.back(); }
    }
    function manualReconnect() {
      if (!wsState.connected) {
        import('./utils/websocket.js').then(m => m.connect());
      }
    }
    return { uiState, chatState, wsState, toasts, goBack, manualReconnect };
  },
  template: `
    <div class="app-container">
      <header class="app-header" v-if="uiState.pageTitle">
        <button class="back-btn" v-if="uiState.backButton" @click="goBack">←</button>
        <span class="title">{{ uiState.pageTitle }}</span>
        <!-- WebSocket连接状态指示器 -->
        <span v-if="wsState.reconnecting" style="margin-left:auto;font-size:11px;color:var(--warning);display:flex;align-items:center;gap:4px">
          <span style="width:8px;height:8px;border-radius:50%;background:var(--warning);display:inline-block"></span>连接中...
        </span>
        <span v-else-if="!wsState.connected && wsState.reconnectAttempt > 0" @click="manualReconnect" style="margin-left:auto;font-size:11px;color:var(--error);display:flex;align-items:center;gap:4px;cursor:pointer">
          <span style="width:8px;height:8px;border-radius:50%;background:var(--error);display:inline-block"></span>点击重连
        </span>
      </header>
      <main :class="['page-content', { 'no-nav': !uiState.showNav }]">
        <router-view v-slot="{ Component, route }">
          <transition :name="route.meta.transition || 'slide-left'" mode="out-in">
            <component :is="Component" :key="route.fullPath" />
          </transition>
        </router-view>
      </main>
      <nav class="bottom-nav" v-if="uiState.showNav">
        <router-link to="/home" class="nav-item" active-class="active">
          <span class="nav-icon">💕</span><span class="nav-label">遇见</span>
        </router-link>
        <router-link to="/discover" class="nav-item" active-class="active">
          <span class="nav-icon">📱</span><span class="nav-label">动态</span>
        </router-link>
        <router-link to="/chat" class="nav-item" active-class="active" style="position:relative">
          <span class="nav-icon">💬</span><span class="nav-label">消息</span>
          <span class="badge" v-if="chatState.unreadCount > 0">{{ chatState.unreadCount > 99 ? '99+' : chatState.unreadCount }}</span>
        </router-link>
        <router-link to="/my" class="nav-item" active-class="active">
          <span class="nav-icon">👤</span><span class="nav-label">我的</span>
        </router-link>
      </nav>
      <div class="toast-container">
        <div v-for="t in toasts" :key="t.id"
          :class="['toast-item', 'toast-' + t.type, { 'toast-leaving': t.leaving }]">{{ t.message }}</div>
      </div>
      <div class="global-loading-overlay" v-if="uiState.globalLoading">
        <div class="loading-spinner"></div>
        <p class="loading-text">{{ uiState.loadingText }}</p>
      </div>
      <image-preview></image-preview>
    </div>
  `
};

const app = createApp(AppRoot);
app.component('image-preview', ImagePreview);
app.use(router);
app.mount('#app');
