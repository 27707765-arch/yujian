/**
 * 消息通知设置页
 */
import { ref, reactive, onMounted } from 'vue';
import { api } from '../utils/api.js';
import { toast } from '../utils/toast.js';
export default {
  setup() {
    const settings = reactive({
      message_notify: 1, match_notify: 1, like_notify: 1, view_notify: 0
    });
    const saving = ref(false);
    onMounted(async () => {
      try {
        const res = await api.get('/user/settings');
        if (res.code === 0 && res.data) {
          ['message_notify','match_notify','like_notify','view_notify'].forEach(k => {
            if (res.data[k] !== undefined) settings[k] = res.data[k];
          });
        }
      } catch (e) {}
    });
    async function save() {
      saving.value = true;
      try { await api.put('/user/settings', { ...settings }); toast.success('已保存'); }
      catch (e) { toast.error('保存失败'); }
      finally { saving.value = false; }
    }
    async function toggle(key) { settings[key] = settings[key] ? 0 : 1; await save(); }
    return { settings, toggle };
  },
  template: `
    <div class="page-padding">
      <div class="menu-item" @click="toggle('message_notify')">
        <div style="flex:1"><div style="font-size:15px">新消息通知</div></div>
        <span style="font-size:24px">{{ settings.message_notify ? '🟢' : '⚪' }}</span>
      </div>
      <div class="menu-item" @click="toggle('match_notify')">
        <div style="flex:1"><div style="font-size:15px">匹配成功通知</div></div>
        <span style="font-size:24px">{{ settings.match_notify ? '🟢' : '⚪' }}</span>
      </div>
      <div class="menu-item" @click="toggle('like_notify')">
        <div style="flex:1"><div style="font-size:15px">收到喜欢通知</div></div>
        <span style="font-size:24px">{{ settings.like_notify ? '🟢' : '⚪' }}</span>
      </div>
      <div class="menu-item" @click="toggle('view_notify')">
        <div style="flex:1"><div style="font-size:15px">主页浏览通知</div></div>
        <span style="font-size:24px">{{ settings.view_notify ? '🟢' : '⚪' }}</span>
      </div>
    </div>
  `
};
