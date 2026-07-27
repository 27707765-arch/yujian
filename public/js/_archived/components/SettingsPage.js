/**
 * 设置页 - 含二维码/隐私/通知/关于/反馈
 */
import { useRouter } from 'vue-router';
import { toast } from '../utils/toast.js';
export default {
  setup() {
    const router = useRouter();
    const menuItems = [
      { icon:'🔒', label:'账号安全', desc:'修改手机号、密码', path: '' },
      { icon:'🔔', label:'消息通知', desc:'管理推送通知', path: '/notify-settings' },
      { icon:'🛡️', label:'隐私设置', desc:'谁可以看我的资料', path: '/privacy-settings' },
      { icon:'❓', label:'帮助与反馈', desc:'常见问题与意见反馈', path: '/feedback' },
      { icon:'📄', label:'关于我们', desc:'v1.0.0', path: '/about' },
      { icon:'📜', label:'用户协议', desc:'服务使用协议', path: '/legal/terms' },
      { icon:'🔏', label:'隐私政策', desc:'隐私保护声明', path: '/legal/privacy' }
    ];
    function clearCache() {
      try {
        localStorage.clear();
        if ('caches' in window) { caches.keys().then(keys => keys.forEach(k => caches.delete(k))); }
        toast.success('缓存已清除');
      } catch (err) { toast.error('清除失败'); }
    }
    function goTo(path) { if (path) router.push(path); else toast.info('功能开发中'); }
    return { menuItems, clearCache, goTo };
  },
  template: `
    <div class="page-padding">
      <div v-for="item in menuItems" :key="item.label" class="menu-item" @click="goTo(item.path)">
        <span class="menu-item-icon">{{ item.icon }}</span>
        <div class="menu-item-text">
          <div class="menu-item-label">{{ item.label }}</div>
          <div class="menu-item-desc">{{ item.desc }}</div>
        </div>
        <span class="menu-item-arrow">›</span>
      </div>
      <button class="btn btn-outline btn-block mt-12" @click="clearCache">清除缓存</button>
    </div>
  `
};
