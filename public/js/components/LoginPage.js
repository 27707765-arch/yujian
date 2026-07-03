/**
 * 登录页 - 手机号/邮箱 双通道验证码登录 (全新视觉)
 */
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../utils/api.js';
import { login } from '../store/userStore.js';
import { toast } from '../utils/toast.js';
import { connect } from '../utils/websocket.js';

export default {
  setup() {
    const router = useRouter();
    const loginMode = ref('phone');
    const phone = ref('');
    const email = ref('');
    const code = ref('');
    const codeSent = ref(false);
    const countdown = ref(0);
    const loading = ref(false);
    let timer = null;

    function getLoginAccount() {
      return loginMode.value === 'email' ? email.value : phone.value;
    }
    function validateAccount() {
      if (loginMode.value === 'email') {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value)) {
          toast.error('请输入正确的邮箱地址'); return false;
        }
      } else {
        if (!/^1[3-9]\d{9}$/.test(phone.value)) {
          toast.error('请输入正确的手机号'); return false;
        }
      }
      return true;
    }
    async function sendCode() {
      if (!validateAccount()) return;
      try {
        const body = loginMode.value === 'email' ? { email: email.value } : { phone: phone.value };
        const res = await api.post('/auth/send-code', body);
        if (res.code === 0) {
          codeSent.value = true; countdown.value = 60;
          timer = setInterval(() => { countdown.value--; if (countdown.value <= 0) { clearInterval(timer); codeSent.value = false; } }, 1000);
          const hint = res.data?.channel === 'email' ? '验证码已发送到邮箱' : '验证码已发送';
          toast.success(hint);
        }
      } catch (err) { toast.error(err.message); }
    }
    async function doLogin() {
      const account = getLoginAccount();
      if (!account || !code.value) {
        toast.error('请输入' + (loginMode.value === 'email' ? '邮箱' : '手机号') + '和验证码');
        return;
      }
      loading.value = true;
      try {
        const result = await login(account, code.value);
        toast.success('登录成功'); connect();
        if (result && result.user && !result.user.onboarding_completed) {
          router.replace('/onboarding');
        } else { router.replace('/home'); }
      } catch (err) { toast.error(err.message); }
      finally { loading.value = false; }
    }
    return { loginMode, phone, email, code, codeSent, countdown, loading, sendCode, doLogin };
  },
  template: `
    <div style="min-height:100vh;background:linear-gradient(180deg,#FFF5F7 0%,#FFF 40%);display:flex;flex-direction:column;align-items:center;padding:0 28px">
      <!-- Logo区 -->
      <div style="margin-top:10vh;text-align:center">
        <div style="width:80px;height:80px;border-radius:24px;background:linear-gradient(135deg,#FF5E7D,#FF8099);margin:0 auto;display:flex;align-items:center;justify-content:center;font-size:40px;box-shadow:0 8px 32px rgba(255,94,125,.3)">💕</div>
        <h1 style="font-size:28px;font-weight:800;margin-top:20px;color:#1D1D1F;letter-spacing:-.5px">欢迎来到遇见</h1>
        <p style="font-size:15px;color:#86868B;margin-top:6px">同城交友，遇见心动</p>
      </div>

      <!-- 登录方式选择 -->
      <div style="width:100%;max-width:360px;margin-top:40px;background:#F5F5F7;border-radius:14px;padding:4px;display:flex">
        <button @click="loginMode='phone'" :style="{flex:1,padding:'12px',borderRadius:'11px',border:'none',fontSize:'15px',fontWeight:600,cursor:'pointer',transition:'all .3s',background:loginMode==='phone'?'#FFF':'transparent',color:loginMode==='phone'?'#FF5E7D':'#86868B',boxShadow:loginMode==='phone'?'0 2px 8px rgba(0,0,0,.08)':'none'}">📱 手机号</button>
        <button @click="loginMode='email'" :style="{flex:1,padding:'12px',borderRadius:'11px',border:'none',fontSize:'15px',fontWeight:600,cursor:'pointer',transition:'all .3s',background:loginMode==='email'?'#FFF':'transparent',color:loginMode==='email'?'#FF5E7D':'#86868B',boxShadow:loginMode==='email'?'0 2px 8px rgba(0,0,0,.08)':'none'}">📧 邮箱</button>
      </div>

      <!-- 输入区 -->
      <div style="width:100%;max-width:360px;margin-top:24px">
        <!-- 手机号 -->
        <div v-if="loginMode==='phone'" style="background:#FFF;border-radius:16px;padding:4px 18px;display:flex;align-items:center;gap:12px;box-shadow:0 2px 12px rgba(0,0,0,.04);border:2px solid #F2F2F7;transition:border .3s;margin-bottom:12px">
          <span style="font-size:20px">📱</span>
          <input v-model="phone" type="tel" maxlength="11" placeholder="请输入手机号" style="flex:1;border:none;outline:none;font-size:16px;padding:14px 0;background:transparent" />
        </div>
        <!-- 邮箱 -->
        <div v-else style="background:#FFF;border-radius:16px;padding:4px 18px;display:flex;align-items:center;gap:12px;box-shadow:0 2px 12px rgba(0,0,0,.04);border:2px solid #F2F2F7;transition:border .3s;margin-bottom:12px">
          <span style="font-size:20px">📧</span>
          <input v-model="email" type="email" placeholder="请输入邮箱地址" style="flex:1;border:none;outline:none;font-size:16px;padding:14px 0;background:transparent" />
        </div>
        <!-- 验证码 -->
        <div style="background:#FFF;border-radius:16px;padding:4px 18px;display:flex;align-items:center;gap:12px;box-shadow:0 2px 12px rgba(0,0,0,.04);border:2px solid #F2F2F7">
          <span style="font-size:20px">🔐</span>
          <input v-model="code" type="text" maxlength="6" placeholder="验证码" style="flex:1;border:none;outline:none;font-size:16px;padding:14px 0;background:transparent" />
          <button @click="sendCode" :disabled="codeSent && countdown>0" style="border:none;background:none;color:#FF5E7D;font-size:14px;font-weight:600;cursor:pointer;white-space:nowrap;opacity:codeSent&&countdown>0?.6:1">
            {{ codeSent && countdown>0 ? countdown+'s后重发' : '获取验证码' }}
          </button>
        </div>
      </div>

      <!-- 登录按钮 -->
      <button class="btn btn-primary btn-block btn-lg" @click="doLogin" :disabled="loading" style="width:100%;max-width:360px;margin-top:28px">
        {{ loading ? '登录中...' : '登录 / 注册' }}
      </button>

      <!-- 协议 -->
      <p style="margin-top:32px;font-size:13px;color:#AEAEB2;text-align:center;line-height:1.8">
        登录即表示同意<br>
        <router-link to="/legal/terms" style="color:#007AFF">《用户协议》</router-link> 和
        <router-link to="/legal/privacy" style="color:#007AFF">《隐私政策》</router-link>
      </p>
    </div>
  `
};
