/**
 * 反馈页面
 */
import { ref } from 'vue';
import { api } from '../utils/api.js';
import { toast } from '../utils/toast.js';
import { useRouter } from 'vue-router';
export default {
  setup() {
    const router = useRouter();
    const content = ref('');
    const contact = ref('');
    const submitting = ref(false);
    async function submit() {
      if (content.value.trim().length < 10) { toast.warning('请至少输入10个字的问题描述'); return; }
      submitting.value = true;
      try {
        const res = await api.post('/feedback', { content: content.value, contact: contact.value });
        if (res.code === 0) { toast.success('感谢反馈！'); router.back(); }
      } catch (e) { toast.error(e.message); }
      finally { submitting.value = false; }
    }
    return { content, contact, submitting, submit };
  },
  template: `
    <div class="page-padding">
      <div class="form-field">
        <label class="form-label">问题描述（至少10字）</label>
        <textarea v-model="content" placeholder="请详细描述你遇到的问题..." maxlength="1000"
          style="width:100%;min-height:150px;padding:12px;border:1.5px solid var(--border);border-radius:var(--radius-sm);font-size:14px;line-height:1.6;resize:vertical;font-family:inherit;outline:none"></textarea>
        <div style="text-align:right;font-size:12px;color:var(--text-muted);margin-top:4px">{{ content.length }}/1000</div>
      </div>
      <div class="form-field">
        <label class="form-label">联系方式（选填）</label>
        <div class="input-group"><input v-model="contact" placeholder="手机号或邮箱，方便我们回复你" /></div>
      </div>
      <button class="btn btn-primary btn-block btn-lg" @click="submit" :disabled="submitting">
        {{ submitting ? '提交中...' : '提交反馈' }}
      </button>
    </div>
  `
};
