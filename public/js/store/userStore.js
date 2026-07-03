/**
 * 用户状态管理
 * 集中管理登录态、用户信息、token
 */

import { reactive, computed } from 'vue';
import { api, getToken, setToken, clearToken, getUserId } from '../utils/api.js';

const state = reactive({
  token: getToken(),
  userId: getUserId(),
  userInfo: null,       // 当前用户完整信息
  loading: false,
  initialized: false    // 是否已加载用户信息
});

const isLoggedIn = computed(() => !!state.token && !!state.userId);

/**
 * 加载用户信息
 */
async function loadUserInfo() {
  if (!isLoggedIn.value) return null;
  state.loading = true;
  try {
    const res = await api.get('/user/info');
    if (res.code === 0 && res.data) {
      state.userInfo = res.data;
      state.initialized = true;
      // 缓存基础信息
      if (res.data.id) localStorage.setItem('userId', res.data.id);
      if (res.data.nickname) localStorage.setItem('userNickname', res.data.nickname);
      if (res.data.avatar) localStorage.setItem('userAvatar', res.data.avatar);
      return res.data;
    }
  } catch (err) {
    console.error('加载用户信息失败:', err);
  } finally {
    state.loading = false;
  }
  return null;
}

/**
 * 登录（phone 或 email 自动识别）
 * @param {string} account - 手机号或邮箱
 * @param {string} code - 验证码
 */
async function login(account, code) {
  const body = { login: account, code };
  const res = await api.post('/auth/login', body);
  if (res.code === 0 && res.data) {
    setToken(res.data.token);
    state.token = res.data.token;
    state.userInfo = res.data.user;
    state.userId = res.data.user.id;
    localStorage.setItem('userId', res.data.user.id);
    return res.data;
  }
  throw new Error(res.message || '登录失败');
}

/**
 * 退出登录
 */
function logout() {
  clearToken();
  state.token = '';
  state.userId = null;
  state.userInfo = null;
  state.initialized = false;
}

/**
 * 更新用户信息（本地）
 */
function updateLocalInfo(info) {
  if (state.userInfo) {
    Object.assign(state.userInfo, info);
  }
}

export { state as userState, isLoggedIn, loadUserInfo, login, logout, updateLocalInfo };
