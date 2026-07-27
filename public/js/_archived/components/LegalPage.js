/**
 * 协议页面 - 根据 route.params.type 显示不同内容
 */
import { ref, computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
export default {
  setup() {
    const route = useRoute();
    const type = computed(() => route.params.type || 'terms');
    const title = computed(() => type.value === 'privacy' ? '隐私政策' : '用户协议');
    return { type, title };
  },
  template: `
    <div class="page-padding" style="padding:24px 20px;line-height:1.8;font-size:14px;color:var(--text-secondary)">
      <h2 style="text-align:center;margin-bottom:20px;color:var(--text)">{{ title }}</h2>
      <div v-if="type === 'terms'">
        <p><strong>一、服务条款</strong></p>
        <p>欢迎使用「遇见」同城社交平台。使用本平台即表示您同意以下条款。</p>
        <p style="margin-top:12px"><strong>二、用户义务</strong></p>
        <p>1. 提供真实、准确的个人信息<br>2. 不得发布违法、色情、暴力等不良内容<br>3. 不得骚扰、辱骂其他用户<br>4. 不得利用平台进行商业推广</p>
        <p style="margin-top:12px"><strong>三、免责声明</strong></p>
        <p>本平台仅提供信息匹配服务，不对用户线下行为承担责任。请用户注意保护人身和财产安全。</p>
        <p style="margin-top:12px"><strong>四、服务变更</strong></p>
        <p>平台保留随时修改、暂停或终止服务的权利，无需事先通知用户。</p>
      </div>
      <div v-else>
        <p><strong>一、信息收集</strong></p>
        <p>我们会收集您提供的个人信息（昵称、年龄、位置等），用于匹配推荐和服务优化。</p>
        <p style="margin-top:12px"><strong>二、信息使用</strong></p>
        <p>您的个人信息仅用于提供匹配服务和改善用户体验，不会出售给第三方。</p>
        <p style="margin-top:12px"><strong>三、信息安全</strong></p>
        <p>我们采用加密传输和存储技术保护您的数据安全。</p>
        <p style="margin-top:12px"><strong>四、联系我们</strong></p>
        <p>如对隐私政策有疑问，请联系：support@yujian.app</p>
      </div>
      <p style="text-align:center;margin-top:24px;font-size:12px;color:var(--text-muted)">© 2026 遇见APP 版权所有</p>
    </div>
  `
};
