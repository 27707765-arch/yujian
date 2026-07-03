/**
 * UI状态管理
 * 管理全局UI状态：导航栏显示、加载状态、Toast
 */

import { reactive } from 'vue';

const state = reactive({
  showNav: true,            // 底部导航栏
  globalLoading: false,     // 全局加载遮罩
  loadingText: '加载中...',
  pageTitle: '遇见',
  backButton: false,        // 是否显示返回按钮
  backAction: null          // 返回按钮回调
});

/**
 * 显示全局加载
 */
function showLoading(text = '加载中...') {
  state.globalLoading = true;
  state.loadingText = text;
}

/**
 * 隐藏全局加载
 */
function hideLoading() {
  state.globalLoading = false;
}

/**
 * 设置页面标题
 */
function setPageTitle(title) {
  state.pageTitle = title;
  document.title = title ? `${title} - 遇见` : '遇见';
}

/**
 * 显示/隐藏底部导航
 */
function setNavVisibility(visible) {
  state.showNav = visible;
}

/**
 * 配置返回按钮
 */
function setBackButton(action) {
  state.backButton = true;
  state.backAction = action;
}

/**
 * 清除返回按钮
 */
function clearBackButton() {
  state.backButton = false;
  state.backAction = null;
}

export {
  state as uiState,
  showLoading,
  hideLoading,
  setPageTitle,
  setNavVisibility,
  setBackButton,
  clearBackButton
};
