/**
 * 欢迎页 - 品牌闪屏
 */
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { isLoggedIn } from '../store/userStore.js';

export default {
  setup() {
    const router = useRouter();
    const show = ref(false);

    onMounted(() => {
      show.value = true;
      // 1.5秒后跳转
      setTimeout(() => {
        if (isLoggedIn.value) {
          router.replace('/home');
        } else {
          router.replace('/login');
        }
      }, 1500);
    });

    function skip() {
      router.replace(isLoggedIn.value ? '/home' : '/login');
    }

    return { show, skip };
  },
  template: `
    <div class="welcome-page" @click="skip">
      <div class="logo" v-if="show">💕</div>
      <h1 style="font-size:36px;margin:16px 0 8px">遇见</h1>
      <p style="font-size:16px;opacity:.9">同城交友，遇见心动</p>
      <p style="font-size:13px;opacity:.6;margin-top:24px">点击屏幕跳过</p>
    </div>
  `
};
