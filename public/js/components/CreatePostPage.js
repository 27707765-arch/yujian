/**
 * 发布动态页
 * 支持多行文本 + 图片上传（最多9张）+ 草稿保存
 */
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../utils/api.js';
import { toast } from '../utils/toast.js';
import { isLoggedIn } from '../store/userStore.js';

const DRAFT_KEY = 'create_post_draft';

export default {
  setup() {
    const router = useRouter();
    const content = ref('');
    const images = ref([]);       // 已上传/预览的图片URL数组
    const uploading = ref(false);
    const publishing = ref(false);

    // 加载草稿
    onMounted(() => {
      if (!isLoggedIn.value) { router.replace('/login'); return; }
      try {
        const draft = JSON.parse(localStorage.getItem(DRAFT_KEY));
        if (draft) {
          content.value = draft.content || '';
          images.value = draft.images || [];
        }
      } catch (e) { /* ignore */ }
    });

    // 保存草稿
    function saveDraft() {
      if (content.value.trim() || images.value.length > 0) {
        localStorage.setItem(DRAFT_KEY, JSON.stringify({
          content: content.value,
          images: images.value
        }));
      }
    }

    // 图片选择/上传
    function onImageSelect(e) {
      const files = Array.from(e.target.files);
      if (images.value.length + files.length > 9) {
        toast.warning('最多上传9张图片');
        return;
      }
      files.forEach(file => uploadImage(file));
      e.target.value = ''; // 重置以便重复选择同一文件
    }

    async function uploadImage(file) {
      uploading.value = true;
      try {
        // 前端压缩
        const compressed = await compressImage(file);
        const fd = new FormData();
        fd.append('image', compressed, file.name);
        const res = await api.upload('/upload/image', fd);
        if (res.code === 0 && res.data) {
          images.value.push(res.data.url || res.data.path || res.data);
          saveDraft();
        }
      } catch (err) {
        toast.error('图片上传失败: ' + err.message);
      } finally {
        uploading.value = false;
      }
    }

    // Canvas 图片压缩
    function compressImage(file, maxWidth = 1200, quality = 0.8) {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          let { width, height } = img;
          if (width > maxWidth) {
            height = Math.round(height * maxWidth / width);
            width = maxWidth;
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          canvas.toBlob(blob => {
            if (blob) {
              resolve(new File([blob], file.name, { type: 'image/jpeg' }));
            } else {
              resolve(file);
            }
          }, 'image/jpeg', quality);
        };
        img.onerror = () => resolve(file);
        img.src = URL.createObjectURL(file);
      });
    }

    // 删除图片
    function removeImage(index) {
      images.value.splice(index, 1);
      saveDraft();
    }

    // 发布
    async function publish() {
      const text = content.value.trim();
      if (!text && images.value.length === 0) {
        toast.warning('请输入内容或添加图片');
        return;
      }
      publishing.value = true;
      try {
        const fd = new FormData();
        fd.append('content', text);
        if (images.value.length > 0) {
          fd.append('images', JSON.stringify(images.value));
        }
        const res = await api.upload('/posts', fd);
        if (res.code === 0) {
          toast.success('发布成功');
          localStorage.removeItem(DRAFT_KEY);
          router.back();
        }
      } catch (err) {
        toast.error(err.message);
        saveDraft(); // 失败时保存草稿
      } finally {
        publishing.value = false;
      }
    }

    // 字数统计
    const charCount = computed(() => content.value.length);

    // 可以发布
    const canPublish = computed(() => {
      return (content.value.trim().length > 0 || images.value.length > 0) && !publishing.value;
    });

    return {
      content, images, uploading, publishing,
      charCount, canPublish,
      onImageSelect, removeImage, publish
    };
  },
  template: `
    <div class="page-padding" style="display:flex;flex-direction:column;height:100%">
      <!-- 文本输入 -->
      <div style="flex:1">
        <textarea
          v-model="content"
          placeholder="分享你的心情..."
          maxlength="500"
          style="width:100%;min-height:160px;border:none;outline:none;font-size:16px;line-height:1.6;resize:none;background:transparent;padding:8px 0"
        ></textarea>

        <!-- 图片上传区 -->
        <div class="tag-row" style="margin-top:12px">
          <!-- 已选图片预览 -->
          <div v-for="(img, idx) in images" :key="idx" style="position:relative;width:80px;height:80px">
            <img :src="img" style="width:100%;height:100%;object-fit:cover;border-radius:8px" />
            <button @click="removeImage(idx)"
              style="position:absolute;top:-6px;right:-6px;width:22px;height:22px;border-radius:50%;background:var(--error);color:#fff;border:none;font-size:14px;cursor:pointer;display:flex;align-items:center;justify-content:center">✕</button>
          </div>
          <!-- 添加按钮 -->
          <label v-if="images.length < 9" style="width:80px;height:80px;border:2px dashed var(--border);border-radius:8px;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:32px;color:var(--text-muted);transition:border-color .2s">
            <span v-if="uploading" class="loading-spinner" style="width:24px;height:24px;border-width:2px"></span>
            <span v-else>+</span>
            <input type="file" accept="image/*" multiple style="display:none" @change="onImageSelect" />
          </label>
        </div>

        <!-- 字数统计 -->
        <div style="text-align:right;font-size:12px;color:var(--text-muted);margin-top:8px">
          {{ charCount }} / 500
          <span v-if="content" style="margin-left:8px;color:var(--text-muted);cursor:pointer" @click="saveDraft()">💾 草稿已保存</span>
        </div>
      </div>

      <!-- 底部操作栏 -->
      <div style="padding:12px 0;padding-bottom:calc(12px + env(safe-area-inset-bottom, 0px))">
        <button class="btn btn-primary btn-block btn-lg" @click="publish" :disabled="!canPublish">
          {{ publishing ? '发布中...' : '发布动态' }}
        </button>
      </div>
    </div>
  `
};
