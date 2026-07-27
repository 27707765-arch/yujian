/**
 * 图片全屏预览组件 - 支持双指缩放 + 左右滑动 + 双击放大
 * 通过 provide/inject 暴露全局方法
 */
import { ref, reactive, onMounted, onUnmounted } from 'vue';

// 全局单例状态
const state = reactive({
  visible: false,
  images: [],
  currentIndex: 0,
  scale: 1,
  offsetX: 0,
  offsetY: 0
});

// 全局打开方法
export function openImagePreview(images, index = 0) {
  state.images = Array.isArray(images) ? images : [images];
  state.currentIndex = Math.max(0, Math.min(index, state.images.length - 1));
  state.scale = 1;
  state.offsetX = 0;
  state.offsetY = 0;
  state.visible = true;
  document.body.style.overflow = 'hidden';
}

// 全局关闭方法
export function closeImagePreview() {
  state.visible = false;
  state.scale = 1;
  state.offsetX = 0;
  state.offsetY = 0;
  document.body.style.overflow = '';
}

// 组件
export default {
  setup() {
    let touchStartX = 0, touchStartY = 0;
    let lastTap = 0;
    let pinchDist0 = 0;
    let scaleOnPinchStart = 1;

    function close() { closeImagePreview(); }

    // 左右滑动
    function onTouchStart(e) {
      if (e.touches.length === 2) {
        // 双指缩放
        pinchDist0 = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        scaleOnPinchStart = state.scale;
        return;
      }
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
    }

    function onTouchMove(e) {
      if (e.touches.length === 2) {
        // 双指缩放
        const dist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        state.scale = Math.max(0.5, Math.min(3, scaleOnPinchStart * dist / pinchDist0));
        return;
      }
    }

    function onTouchEnd(e) {
      const dx = (e.changedTouches[0]?.clientX || 0) - touchStartX;
      const dy = (e.changedTouches[0]?.clientY || 0) - touchStartY;

      // 下滑关闭
      if (state.scale === 1 && Math.abs(dy) > 80 && Math.abs(dy) > Math.abs(dx)) {
        close();
        return;
      }
      // 左右滑动切换
      if (state.scale === 1 && Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) {
        if (dx < 0 && state.currentIndex < state.images.length - 1) {
          state.currentIndex++;
        } else if (dx > 0 && state.currentIndex > 0) {
          state.currentIndex--;
        }
      }
      // 双击放大/还原
      const now = Date.now();
      if (now - lastTap < 300 && state.scale === 1) {
        state.scale = 2;
      } else if (now - lastTap < 300 && state.scale > 1) {
        state.scale = 1;
      }
      lastTap = now;
    }

    function onWheel(e) {
      e.preventDefault();
      state.scale = Math.max(0.5, Math.min(3, state.scale - e.deltaY * 0.002));
    }

    function prev() { if (state.currentIndex > 0) state.currentIndex--; }
    function next() { if (state.currentIndex < state.images.length - 1) state.currentIndex++; }

    onMounted(() => {
      document.addEventListener('keydown', onKeydown);
    });
    onUnmounted(() => {
      document.removeEventListener('keydown', onKeydown);
    });
    function onKeydown(e) {
      if (!state.visible) return;
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowLeft') prev();
      if (e.key === 'ArrowRight') next();
    }

    return { state, close, onTouchStart, onTouchMove, onTouchEnd, prev, next };
  },
  template: `
    <div v-if="state.visible" class="image-preview-overlay"
      @touchstart="onTouchStart" @touchmove="onTouchMove" @touchend="onTouchEnd"
      @click.self="close">
      <img :src="state.images[state.currentIndex]"
        :style="{ transform: 'scale(' + state.scale + ')', transition: 'transform .2s' }"
        class="image-preview-img" @dblclick.prevent="" />
      <button class="image-preview-close" @click="close">✕</button>
      <div class="image-preview-counter" v-if="state.images.length > 1">
        {{ state.currentIndex + 1 }} / {{ state.images.length }}
      </div>
      <!-- 左右箭头 -->
      <button v-if="state.images.length > 1 && state.currentIndex > 0"
        @click.stop="prev"
        style="position:fixed;left:16px;top:50%;transform:translateY(-50%);z-index:10001;background:rgba(255,255,255,.2);color:#fff;border:none;width:40px;height:40px;border-radius:50%;font-size:22px;cursor:pointer">‹</button>
      <button v-if="state.images.length > 1 && state.currentIndex < state.images.length - 1"
        @click.stop="next"
        style="position:fixed;right:16px;top:50%;transform:translateY(-50%);z-index:10001;background:rgba(255,255,255,.2);color:#fff;border:none;width:40px;height:40px;border-radius:50%;font-size:22px;cursor:pointer">›</button>
    </div>
  `
};
