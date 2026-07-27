/**
 * 新手引导 - 5步完善资料
 */
import { ref, reactive, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../utils/api.js';
import { userState, loadUserInfo } from '../store/userStore.js';
import { toast } from '../utils/toast.js';

export default {
  setup() {
    const router = useRouter();
    const step = ref(1);
    const totalSteps = 5;
    const form = reactive({
      gender: null, age: 25, height: 170, tags: [], bio: ''
    });
    const allTags = ref([]);
    const saving = ref(false);
    const avatarFile = ref(null);
    const avatarPreview = ref('');

    onMounted(async () => {
      // 加载已有信息
      await loadUserInfo();
      const u = userState.userInfo;
      if (u) {
        if (u.gender !== null && u.gender !== undefined) step.value = 2;
        if (u.avatar) { step.value = Math.max(step.value, 3); avatarPreview.value = u.avatar; }
      }
      try {
        const res = await api.get('/user/tags');
        if (res.code === 0) allTags.value = res.data || [];
      } catch (e) {}
      if (!allTags.value.length) {
        allTags.value = ['健身','跑步','游泳','旅行','美食','摄影','宠物','音乐','电影','游戏','读书','滑雪','瑜伽','篮球','画画'];
      }
    });

    function nextStep() { if (step.value < totalSteps) step.value++; }
    function prevStep() { if (step.value > 1) step.value--; }

    function toggleTag(t) {
      const idx = form.tags.indexOf(t);
      if (idx > -1) form.tags.splice(idx, 1);
      else if (form.tags.length < 10) form.tags.push(t);
      else toast.warning('最多选10个');
    }

    function onAvatarChange(e) {
      const file = e.target.files[0];
      if (file) { avatarFile.value = file; avatarPreview.value = URL.createObjectURL(file); }
    }

    async function finish() {
      saving.value = true;
      try {
        // 上传头像
        if (avatarFile.value) {
          const fd = new FormData(); fd.append('avatar', avatarFile.value);
          const r = await api.upload('/user/avatar', fd);
          if (r.code === 0) avatarPreview.value = r.data?.avatar || '';
        }
        // 保存资料
        const data = {
          gender: form.gender, age: form.age, height: form.height,
          tags: form.tags, bio: form.bio
        };
        await api.put('/user/info', data);
        // 完成引导
        try { await api.post('/user/onboarding/complete'); } catch (e) {}
        toast.success('资料已完善！');
        router.replace('/home');
      } catch (err) { toast.error(err.message); }
      finally { saving.value = false; }
    }

    return { step, totalSteps, form, allTags, avatarPreview, saving,
      nextStep, prevStep, toggleTag, onAvatarChange, finish };
  },
  template: `
    <div class="page-padding" style="display:flex;flex-direction:column;height:100%;justify-content:space-between">
      <!-- 进度条 -->
      <div>
        <div style="height:4px;background:var(--border);border-radius:2px;margin-bottom:24px">
          <div :style="{height:'100%',background:'var(--primary)',width:(step/totalSteps*100)+'%',borderRadius:'2px',transition:'width .3s'}"></div>
        </div>

        <!-- 步骤1: 性别 -->
        <div v-if="step === 1">
          <h3 style="text-align:center;margin-bottom:24px">你的性别？</h3>
          <div style="display:flex;gap:16px;justify-content:center">
            <div @click="form.gender=1;nextStep()" :class="['amount-card', form.gender===1?'selected':'']" style="padding:32px 24px;cursor:pointer">
              <div style="font-size:48px">👨</div><div style="font-size:16px;margin-top:8px">男</div>
            </div>
            <div @click="form.gender=0;nextStep()" :class="['amount-card', form.gender===0?'selected':'']" style="padding:32px 24px;cursor:pointer">
              <div style="font-size:48px">👩</div><div style="font-size:16px;margin-top:8px">女</div>
            </div>
            <div @click="form.gender=2;nextStep()" :class="['amount-card', form.gender===2?'selected':'']" style="padding:32px 24px;cursor:pointer">
              <div style="font-size:48px">😊</div><div style="font-size:16px;margin-top:8px">保密</div>
            </div>
          </div>
        </div>

        <!-- 步骤2: 年龄+身高 -->
        <div v-else-if="step === 2">
          <h3 style="text-align:center;margin-bottom:24px">你的年龄和身高？</h3>
          <div style="display:flex;gap:16px">
            <div class="form-field" style="flex:1">
              <div class="input-group"><input v-model.number="form.age" type="number" min="18" max="80" placeholder="年龄" /></div>
            </div>
            <div class="form-field" style="flex:1">
              <div class="input-group"><input v-model.number="form.height" type="number" min="100" max="250" placeholder="身高(cm)" /></div>
            </div>
          </div>
          <div class="text-center" style="margin-top:24px"><button class="btn btn-primary btn-lg" @click="nextStep">下一步</button></div>
        </div>

        <!-- 步骤3: 头像 -->
        <div v-else-if="step === 3">
          <h3 style="text-align:center;margin-bottom:24px">上传一张好看的头像</h3>
          <div class="avatar-upload-area">
            <label style="cursor:pointer">
              <div class="avatar-upload-box" style="border-style:dashed">
                <img v-if="avatarPreview" :src="avatarPreview" />
                <span v-else style="font-size:36px">📷</span>
              </div>
              <input type="file" accept="image/*" style="display:none" @change="onAvatarChange" />
            </label>
          </div>
          <div class="text-center mt-12"><button class="btn btn-primary btn-lg" @click="nextStep">{{ avatarPreview ? '下一步' : '跳过' }}</button></div>
        </div>

        <!-- 步骤4: 标签 -->
        <div v-else-if="step === 4">
          <h3 style="text-align:center;margin-bottom:24px">选择你感兴趣的标签（3-10个）</h3>
          <div class="tag-row">
            <span v-for="t in allTags" :key="t"
              :class="['tag-option','tag',form.tags.includes(t)?'tag-primary':'']"
              @click="toggleTag(t)">{{ t }}</span>
          </div>
          <div class="text-center mt-12" style="font-size:13px;color:var(--text-muted)">已选 {{ form.tags.length }}/10</div>
          <div class="text-center mt-12"><button class="btn btn-primary btn-lg" @click="nextStep" :disabled="form.tags.length < 3">下一步</button></div>
        </div>

        <!-- 步骤5: 简介 -->
        <div v-else-if="step === 5">
          <h3 style="text-align:center;margin-bottom:24px">用一句话介绍自己</h3>
          <div class="input-group" style="margin-bottom:24px">
            <input v-model="form.bio" placeholder="例如：热爱旅行和美食的90后..." maxlength="50" />
          </div>
          <div style="text-align:right;font-size:12px;color:var(--text-muted);margin-bottom:24px">{{ form.bio.length }}/50</div>
          <button class="btn btn-primary btn-block btn-lg" @click="finish" :disabled="saving">
            {{ saving ? '保存中...' : '🎉 完成' }}
          </button>
        </div>
      </div>

      <!-- 底部导航 -->
      <div style="display:flex;justify-content:space-between;padding-bottom:calc(env(safe-area-inset-bottom,0px)+16px)">
        <button v-if="step > 1" class="btn btn-outline btn-sm" @click="prevStep">上一步</button>
        <div v-else></div>
        <span class="text-muted">{{ step }} / {{ totalSteps }}</span>
      </div>
    </div>
  `
};
