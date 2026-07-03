/**
 * 我的 - 个人中心 (全新视觉)
 */
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { userState, isLoggedIn, logout, loadUserInfo } from '../store/userStore.js';
import { api } from '../utils/api.js';
import { toast } from '../utils/toast.js';
import { disconnect } from '../utils/websocket.js';

export default {
  setup() {
    const router = useRouter();
    const wallet = ref({ balance: 0 });

    onMounted(async () => {
      if (!isLoggedIn.value) { router.replace('/login'); return; }
      if (!userState.userInfo) await loadUserInfo();
      try { const res = await api.get('/wallet/info'); if (res.code === 0) wallet.value = res.data; } catch (e) {}
    });

    function doLogout() { disconnect(); logout(); toast.info('已退出登录'); router.replace('/login'); }

    const menuSections = [
      { title: '服务', items: [
        { icon:'📅', label:'每日签到', path:'/checkin', color:'#FF9500' },
        { icon:'📝', label:'发动态', path:'/create-post', color:'#FF5E7D' },
        { icon:'💝', label:'我的遇见', path:'/meet', color:'#FF3B8B' }
      ]},
      { title: '钱包', items: [
        { icon:'💰', label:'金币充值', path:'/recharge', color:'#FFD60A' },
        { icon:'👑', label:'会员中心', path:'/vip', color:'#FFAA00' },
        { icon:'📊', label:'我的收益', path:'/earnings', color:'#34C759' }
      ]},
      { title: '社交', items: [
        { icon:'👥', label:'粉丝', path:'/fans', color:'#007AFF' },
        { icon:'❤️', label:'关注', path:'/following', color:'#FF5E7D' }
      ]},
      { title: '其他', items: [
        { icon:'⚙️', label:'设置', path:'/settings', color:'#86868B' }
      ]}
    ];

    return { user: userState, wallet, menuSections, doLogout, router };
  },
  template: `
    <div>
      <!-- 个人卡片 -->
      <div style="background:linear-gradient(160deg,#FF5E7D 0%,#FF3B8B 100%);color:#FFF;padding:32px 20px 28px;position:relative;overflow:hidden">
        <!-- 装饰圆 -->
        <div style="position:absolute;top:-40px;right:-20px;width:120px;height:120px;border-radius:50%;background:rgba(255,255,255,.08)"></div>
        <div style="position:absolute;bottom:-30px;left:50%;width:200px;height:60px;border-radius:50%;background:rgba(255,255,255,.06)"></div>
        <!-- 内容 -->
        <div style="display:flex;align-items:center;gap:16px;position:relative;z-index:1">
          <div :style="{width:'68px',height:'68px',borderRadius:'50%',overflow:'hidden',flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center',background:'rgba(255,255,255,.25)',border:'3px solid rgba(255,255,255,.4)',fontSize:'30px'}">
            <img v-if="user.userInfo?.avatar" :src="user.userInfo.avatar" style="width:100%;height:100%;object-fit:cover" />
            <span v-else>👤</span>
          </div>
          <div style="flex:1;min-width:0">
            <div style="font-size:22px;font-weight:800;letter-spacing:-.3px">{{ user.userInfo?.nickname || '遇见用户' }}</div>
            <div style="font-size:13px;opacity:.75;margin-top:2px">{{ user.userInfo?.bio || '还没有个性签名' }}</div>
            <div style="display:flex;gap:10px;margin-top:8px">
              <span style="font-size:12px;background:rgba(255,255,255,.2);padding:3px 10px;border-radius:10px">{{ user.userInfo?.age||'?' }}岁</span>
              <span style="font-size:12px;background:rgba(255,255,255,.2);padding:3px 10px;border-radius:10px">{{ user.userInfo?.location||'设置位置' }}</span>
            </div>
          </div>
          <span v-if="user.userInfo?.is_vip" style="position:absolute;top:0;right:0;font-size:12px;background:rgba(255,214,10,.25);color:#FFD60A;padding:4px 12px;border-radius:12px;font-weight:700">👑 VIP</span>
        </div>
        <!-- 金币卡片 -->
        <div style="margin-top:20px;display:flex;gap:12px;position:relative;z-index:1" @click="router.push('/earnings')">
          <div style="flex:1;background:rgba(255,255,255,.12);border-radius:14px;padding:14px;text-align:center;cursor:pointer;backdrop-filter:blur(10px)">
            <div style="font-size:26px;font-weight:800">🪙 {{ wallet.balance || 0 }}</div>
            <div style="font-size:12px;opacity:.8">我的金币</div>
          </div>
          <div @click.stop="router.push('/recharge')" style="flex:1;background:rgba(255,255,255,.15);border-radius:14px;padding:14px;text-align:center;cursor:pointer;backdrop-filter:blur(10px)">
            <div style="font-size:26px;font-weight:800">💳</div>
            <div style="font-size:12px;opacity:.8">充值</div>
          </div>
          <div @click.stop="router.push('/edit-profile')" style="flex:1;background:rgba(255,255,255,.15);border-radius:14px;padding:14px;text-align:center;cursor:pointer;backdrop-filter:blur(10px)">
            <div style="font-size:26px;font-weight:800">✏️</div>
            <div style="font-size:12px;opacity:.8">编辑资料</div>
          </div>
        </div>
        <!-- VIP提示 -->
        <div v-if="user.userInfo?.is_vip" style="margin-top:10px;position:relative;z-index:1;text-align:right;font-size:12px;opacity:.7">
          VIP到期: {{ user.userInfo?.vip_expire_at ? new Date(user.userInfo.vip_expire_at).toLocaleDateString() : '未知' }}
          <span @click="router.push('/vip')" style="margin-left:4px;text-decoration:underline;cursor:pointer;color:#FFD60A">续费</span>
        </div>
      </div>

      <!-- 菜单分组 -->
      <div v-for="(section, si) in menuSections" :key="si" class="page-padding" style="padding-top:0;padding-bottom:0">
        <div style="font-size:13px;font-weight:700;color:#86868B;margin:20px 0 10px 4px;text-transform:uppercase;letter-spacing:1px">{{ section.title }}</div>
        <div v-for="item in section.items" :key="item.path" @click="router.push(item.path)"
          style="display:flex;align-items:center;padding:14px 16px;background:#FFF;border-radius:14px;margin-bottom:6px;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.03)">
          <div :style="{width:'36px',height:'36px',borderRadius:'10px',background:item.color+'1A',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'20px'}">{{ item.icon }}</div>
          <span style="flex:1;margin-left:12px;font-size:15px;font-weight:500;color:#1D1D1F">{{ item.label }}</span>
          <span style="color:#C7C7CC;font-size:16px">›</span>
        </div>
      </div>

      <div class="page-padding" style="padding-top:12px;padding-bottom:32px">
        <button class="btn btn-outline btn-block" @click="doLogout" style="border-color:#E5E5EA;color:#86868B;border-radius:14px;margin-top:8px">退出登录</button>
      </div>
    </div>
  `
};
