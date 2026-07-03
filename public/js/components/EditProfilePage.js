/**
 * 编辑资料页 - 支持定位获取 + 热门城市选择
 */
import { ref, reactive, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../utils/api.js';
import { userState, updateLocalInfo } from '../store/userStore.js';
import { toast } from '../utils/toast.js';

export default {
  setup() {
    const router = useRouter();
    const form = reactive({
      nickname: '', gender: null, age: null, height: null,
      occupation: '', location: '', bio: '', tags: []
    });
    const avatarFile = ref(null);
    const avatarPreview = ref('');
    const allTags = ref([]);
    const saving = ref(false);
    const locating = ref(false);
    const showCities = ref(false);

    const hotCities = [
      '北京', '上海', '广州', '深圳', '杭州', '成都', '重庆', '武汉',
      '南京', '天津', '苏州', '西安', '长沙', '郑州', '青岛', '大连',
      '厦门', '宁波', '无锡', '佛山'
    ];

    onMounted(async () => {
      const u = userState.userInfo;
      if (u) {
        Object.assign(form, {
          nickname: u.nickname || '',
          gender: u.gender, age: u.age, height: u.height,
          occupation: u.occupation || '', location: u.location || '',
          bio: u.bio || '',
          tags: typeof u.tags === 'string' ? JSON.parse(u.tags) : (u.tags || [])
        });
        avatarPreview.value = u.avatar || '';
      }
      try {
        const res = await api.get('/user/tags');
        if (res.code === 0) allTags.value = res.data || [];
      } catch (err) { /* use defaults */ }
      if (allTags.value.length === 0) {
        allTags.value = ['健身','跑步','瑜伽','篮球','游泳','旅行','美食','摄影','宠物','音乐','电影','游戏','读书','画画','滑雪'];
      }
    });

    function onAvatarChange(e) {
      const file = e.target.files[0];
      if (file) { avatarFile.value = file; avatarPreview.value = URL.createObjectURL(file); }
    }

    function toggleTag(tag) {
      const idx = form.tags.indexOf(tag);
      if (idx > -1) { form.tags.splice(idx, 1); }
      else if (form.tags.length < 10) { form.tags.push(tag); }
      else { toast.warning('最多选择10个标签'); }
    }

    async function getLocation() {
      if (!navigator.geolocation) { toast.warning('浏览器不支持定位'); return; }
      locating.value = true;
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          try {
            const res = await api.post('/user/location', {
              lat: pos.coords.latitude,
              lng: pos.coords.longitude
            });
            if (res.code === 0 && res.data?.city) {
              form.location = res.data.city;
              toast.success('定位成功: ' + res.data.city);
            }
          } catch (err) { toast.error('定位上报失败'); }
          finally { locating.value = false; }
        },
        () => { toast.error('定位失败，请手动输入'); locating.value = false; },
        { timeout: 10000, enableHighAccuracy: false }
      );
    }

    function selectCity(city) { form.location = city; showCities.value = false; }

    async function save() {
      saving.value = true;
      try {
        if (avatarFile.value) {
          const fd = new FormData(); fd.append('avatar', avatarFile.value);
          const avatarRes = await api.upload('/user/avatar', fd);
          if (avatarRes.code === 0) avatarPreview.value = avatarRes.data?.avatar || '';
        }
        const data = {
          nickname: form.nickname, gender: form.gender,
          age: form.age ? parseInt(form.age) : null,
          height: form.height ? parseInt(form.height) : null,
          occupation: form.occupation, location: form.location,
          bio: form.bio, tags: form.tags
        };
        const res = await api.put('/user/info', data);
        if (res.code === 0) { updateLocalInfo(data); toast.success('保存成功'); router.back(); }
      } catch (err) { toast.error(err.message); }
      finally { saving.value = false; }
    }

    return { form, avatarPreview, allTags, saving, locating, showCities, hotCities,
      onAvatarChange, toggleTag, getLocation, selectCity, save };
  },
  template: `
    <div class="page-padding" style="padding-top:16px;padding-bottom:16px">
      <!-- 头像 -->
      <div class="avatar-upload-area">
        <label style="cursor:pointer">
          <div class="avatar-upload-box">
            <img v-if="avatarPreview" :src="avatarPreview" />
            <span v-else style="font-size:32px">📷</span>
          </div>
          <input type="file" accept="image/*" style="display:none" @change="onAvatarChange" />
        </label>
        <p class="avatar-upload-hint">点击更换头像</p>
      </div>

      <!-- 基本信息 -->
      <div class="form-field">
        <label class="form-label">昵称</label>
        <div class="input-group"><input v-model="form.nickname" placeholder="2-50个字符" /></div>
      </div>
      <div class="form-field">
        <label class="form-label">职业</label>
        <div class="input-group"><input v-model="form.occupation" placeholder="你的职业" /></div>
      </div>

      <!-- 所在地 + 定位 + 热门城市 -->
      <div class="form-field">
        <label class="form-label">所在地</label>
        <div class="info-row" style="margin-bottom:8px">
          <div class="input-group" style="flex:1"><input v-model="form.location" placeholder="城市名" /></div>
          <button class="btn btn-sm btn-outline" @click="getLocation" :disabled="locating">{{ locating ? '定位中...' : '📍 定位获取' }}</button>
        </div>
        <div v-if="showCities" class="tag-row" style="margin-bottom:8px">
          <span v-for="c in hotCities" :key="c" class="tag-option tag" @click="selectCity(c)"
            :style="{ background: form.location === c ? 'var(--primary)' : '', color: form.location === c ? '#fff' : '' }">{{ c }}</span>
        </div>
        <button class="btn btn-sm btn-outline" style="font-size:12px" @click="showCities = !showCities">
          {{ showCities ? '收起热门城市 ▲' : '热门城市 ▼' }}
        </button>
      </div>

      <!-- 性别 -->
      <div class="form-field">
        <label class="form-label">性别</label>
        <div class="flex-center gap-12">
          <button class="btn btn-sm" :class="form.gender === 1 ? 'btn-primary' : 'btn-outline'" @click="form.gender = 1">男</button>
          <button class="btn btn-sm" :class="form.gender === 0 ? 'btn-primary' : 'btn-outline'" @click="form.gender = 0">女</button>
          <button class="btn btn-sm" :class="form.gender === 2 ? 'btn-primary' : 'btn-outline'" @click="form.gender = 2">保密</button>
        </div>
      </div>

      <!-- 年龄 & 身高 -->
      <div class="form-field-row">
        <div class="form-field">
          <label class="form-label">年龄</label>
          <div class="input-group"><input v-model.number="form.age" type="number" min="18" max="80" placeholder="18" /></div>
        </div>
        <div class="form-field">
          <label class="form-label">身高(cm)</label>
          <div class="input-group"><input v-model.number="form.height" type="number" min="100" max="250" placeholder="170" /></div>
        </div>
      </div>

      <!-- 个性签名 -->
      <div class="form-field">
        <label class="form-label">个性签名</label>
        <div class="input-group"><input v-model="form.bio" placeholder="写一句话介绍自己" maxlength="500" /></div>
      </div>

      <!-- 兴趣标签 -->
      <div class="tag-select">
        <label class="form-label">兴趣标签 (已选 {{ form.tags.length }}/10)</label>
        <div class="tag-row">
          <span v-for="t in allTags" :key="t"
            :class="['tag-option', 'tag', form.tags.includes(t) ? 'tag-primary' : '']"
            @click="toggleTag(t)">{{ t }}</span>
        </div>
      </div>

      <button class="btn btn-primary btn-block btn-lg" @click="save" :disabled="saving">
        {{ saving ? '保存中...' : '保存资料' }}
      </button>
    </div>
  `
};
