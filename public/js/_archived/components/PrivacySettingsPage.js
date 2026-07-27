/**
 * 隐私设置页
 */
import { ref, reactive, onMounted } from 'vue';
import { api } from '../utils/api.js';
import { toast } from '../utils/toast.js';
export default {
  setup() {
    const settings = reactive({
      hide_distance: 0, hide_online_status: 0,
      hide_last_active: 0, allow_stranger_chat: 1
    });
    const saving = ref(false);
    onMounted(async () => {
      try {
        const res = await api.get('/user/settings');
        if (res.code === 0 && res.data) Object.assign(settings, res.data);
      } catch (e) { /* */ }
    });
    async function save() {
      saving.value = true;
      try {
        await api.put('/user/settings', { ...settings });
        toast.success('已保存');
      } catch (e) { toast.error('保存失败'); }
      finally { saving.value = false; }
    }
    async function toggle(key) { settings[key] = settings[key] ? 0 : 1; await save(); }
    return { settings, toggle };
  },
  template: `
    <div class="page-padding">
      <div class="menu-item" @click="toggle('hide_distance')">
        <div style="flex:1"><div style="font-size:15px">隐藏距离</div><div class="text-muted">不让其他人看到你的位置距离</div></div>
        <span style="font-size:24px">{{ settings.hide_distance ? '🟢' : '⚪' }}</span>
      </div>
      <div class="menu-item" @click="toggle('hide_online_status')">
        <div style="flex:1"><div style="font-size:15px">隐藏在线状态</div><div class="text-muted">不显示是否在线</div></div>
        <span style="font-size:24px">{{ settings.hide_online_status ? '🟢' : '⚪' }}</span>
      </div>
      <div class="menu-item" @click="toggle('hide_last_active')">
        <div style="flex:1"><div style="font-size:15px">隐藏最后在线时间</div></div>
        <span style="font-size:24px">{{ settings.hide_last_active ? '🟢' : '⚪' }}</span>
      </div>
      <div class="menu-item" @click="toggle('allow_stranger_chat')">
        <div style="flex:1"><div style="font-size:15px">允许陌生人私信</div></div>
        <span style="font-size:24px">{{ settings.allow_stranger_chat ? '🟢' : '⚪' }}</span>
      </div>
    </div>
  `
};
