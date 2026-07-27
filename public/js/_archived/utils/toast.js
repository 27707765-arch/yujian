/**
 * Toast通知系统
 * Vue 3 reactive 驱动的全局Toast
 */

import { reactive } from 'vue';

const toasts = reactive([]);
let toastId = 0;

/**
 * 显示Toast
 * @param {string} message - 消息内容
 * @param {'success'|'error'|'info'|'warning'} type - 类型
 * @param {number} duration - 持续时间(ms)，默认3000
 */
function showToast(message, type = 'info', duration = 3000) {
  const id = ++toastId;
  toasts.push({ id, message, type, leaving: false });

  setTimeout(() => {
    const t = toasts.find(t => t.id === id);
    if (t) t.leaving = true;
    setTimeout(() => {
      const idx = toasts.findIndex(t => t.id === id);
      if (idx > -1) toasts.splice(idx, 1);
    }, 300);
  }, duration);
}

const toast = {
  success: (msg, duration) => showToast(msg, 'success', duration),
  error: (msg, duration) => showToast(msg, 'error', duration || 4000),
  info: (msg, duration) => showToast(msg, 'info', duration),
  warning: (msg, duration) => showToast(msg, 'warning', duration)
};

export { toasts, toast };
