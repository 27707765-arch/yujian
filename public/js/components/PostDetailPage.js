/**
 * 动态详情 + 评论区（支持回复）
 */
import { ref, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '../utils/api.js';
import { userState } from '../store/userStore.js';
import { toast } from '../utils/toast.js';

export default {
  setup() {
    const route = useRoute();
    const router = useRouter();
    const post = ref(null);
    const comments = ref([]);
    const commentText = ref('');
    const loading = ref(true);
    const replyTo = ref(null); // { id, nickname } 正在回复的评论信息

    const postId = ref(parseInt(route.params.id));

    async function loadPost() {
      loading.value = true;
      try {
        const res = await api.get(`/posts/${postId.value}`);
        if (res.code === 0) {
          post.value = res.data.post || res.data;
          comments.value = res.data.comments || post.value.comments || [];
        }
      } catch (err) { toast.error('加载失败'); }
      finally { loading.value = false; }
    }

    onMounted(loadPost);

    // 开始回复某条评论
    function startReply(comment) {
      replyTo.value = { id: comment.id, nickname: comment.nickname };
      commentText.value = '';
    }

    // 取消回复
    function cancelReply() {
      replyTo.value = null;
      commentText.value = '';
    }

    async function addComment() {
      const text = commentText.value.trim();
      if (!text) return;
      try {
        const body = { content: text };
        if (replyTo.value) {
          body.parent_id = replyTo.value.id;
        }
        const res = await api.post(`/posts/${postId.value}/comment`, body);
        commentText.value = '';
        replyTo.value = null;
        toast.success('评论成功');
        // 重新加载评论以获取嵌套结构
        try {
          const refetch = await api.get(`/posts/${postId.value}`);
          if (refetch.code === 0) {
            comments.value = refetch.data.comments || post.value?.comments || [];
          }
        } catch (e) { /* 静默 */ }
        if (post.value) post.value.comment_count = (post.value.comment_count || 0) + 1;
      } catch (err) { toast.error(err.message); }
    }

    async function toggleLike(event) {
      try {
        if (event && event.target) {
          event.target.classList.add('heart-anim');
          event.target.addEventListener('animationend', function() { this.classList.remove('heart-anim'); }, { once: true });
        }
        if (navigator.vibrate) { navigator.vibrate(50); }
        await api.post(`/posts/${postId.value}/like`);
        post.value.liked = !post.value.liked;
        post.value.like_count += post.value.liked ? 1 : -1;
      } catch (err) { toast.error(err.message); }
    }

    async function toggleCommentLike(comment) {
      try {
        if (navigator.vibrate) { navigator.vibrate(50); }
        await api.post('/comments/' + comment.id + '/like');
        comment.liked = !comment.liked;
        comment.like_count = (comment.like_count || 0) + (comment.liked ? 1 : -1);
        if (comment.like_count < 0) comment.like_count = 0;
      } catch (err) { toast.error(err.message); }
    }

    function timeAgo(t) {
      const d = Math.floor((Date.now() - new Date(t).getTime()) / 1000);
      if (d < 60) return '刚刚';
      if (d < 3600) return Math.floor(d / 60) + '分钟前';
      if (d < 86400) return Math.floor(d / 3600) + '小时前';
      return Math.floor(d / 86400) + '天前';
    }

    function viewUser(id) { router.push(`/user/${id}`); }

    // 判断是否为子评论（回复）
    function isReply(c) { return !!c.parent_id; }

    return { post, comments, commentText, loading, replyTo, viewUser,
      addComment, toggleLike, toggleCommentLike, timeAgo, startReply, cancelReply, isReply };
  },
  template: `
    <div>
      <div v-if="loading" class="text-center" style="padding:48px"><div class="loading-spinner"></div></div>
      <div v-else-if="!post" class="empty-state"><div class="empty-icon">😕</div><div class="empty-title">动态不存在</div></div>
      <div v-else>
        <!-- 动态内容 -->
        <div style="background:var(--bg-white);padding:16px">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
            <div class="avatar-circle avatar-sm">
              <img v-if="post.avatar" :src="post.avatar" />
              <span v-else class="avatar-default" style="font-size:16px">👤</span>
            </div>
            <div>
              <div style="font-weight:600">{{ post.nickname || '用户' }}</div>
              <div class="text-muted">{{ timeAgo(post.created_at) }}</div>
            </div>
          </div>
          <p style="line-height:1.6;margin-bottom:10px">{{ post.content }}</p>
          <div v-if="post.images && post.images.length" :style="{display:'grid',gridTemplateColumns:'repeat('+Math.min(post.images.length,3)+',1fr)',gap:'4px',marginBottom:'10px'}">
            <img v-for="(img,i) in post.images" :key="i" :src="img" style="width:100%;aspect-ratio:1;object-fit:cover;border-radius:6px" />
          </div>
          <div class="action-bar">
            <span @click="toggleLike" :style="{color:post.liked?'var(--primary)':''}">{{ post.liked ? '❤️' : '🤍' }} {{ post.like_count || 0 }}</span>
            <span>💬 {{ post.comment_count || 0 }}</span>
          </div>
        </div>

        <div class="divider"></div>

        <!-- 评论区 -->
        <div class="page-padding" style="margin-bottom:16px">
          <h4 style="margin-bottom:12px;font-size:15px">评论 ({{ comments.length }})</h4>
          <div v-if="comments.length === 0" class="empty-state" style="padding:24px">
            <div class="empty-icon">💬</div><div class="empty-desc">还没有评论，来说点什么吧</div>
          </div>
          <div v-else>
            <template v-for="c in comments" :key="c.id">
              <!-- 顶级评论 -->
              <div v-if="!isReply(c)" style="display:flex;gap:10px;margin-bottom:12px;padding-bottom:12px;border-bottom:1px solid var(--border)">
                <div class="avatar-circle avatar-sm">
                  <img v-if="c.avatar" :src="c.avatar" />
                  <span v-else class="avatar-default" style="font-size:16px">👤</span>
                </div>
                <div style="flex:1">
                  <div class="info-row" style="margin-bottom:4px">
                    <span class="post-card-username">{{ c.nickname || '用户' }}</span>
                    <span style="font-size:11px;color:var(--text-muted)">{{ timeAgo(c.created_at) }}</span>
                  </div>
                  <p style="font-size:14px;line-height:1.5;margin-bottom:4px">{{ c.content }}</p>
                  <div class="info-row" style="gap:16px">
                    <span @click="startReply(c)" style="font-size:12px;color:var(--text-muted);cursor:pointer">回复</span>
                    <span @click="toggleCommentLike(c)" :style="{fontSize:'12px',color:c.liked?'var(--primary)':(c.like_count?'var(--text-muted)':'var(--text-muted)'),cursor:'pointer'}">{{ c.liked ? '❤️' : '🤍' }} {{ c.like_count || '' }}</span>
                  </div>
                </div>
              </div>

              <!-- 子评论（嵌套回复） -->
              <div v-for="reply in c.replies" v-if="c.replies" :key="reply.id"
                style="display:flex;gap:10px;margin-bottom:10px;padding-bottom:10px;padding-left:46px;border-bottom:1px solid var(--border)">
                <div class="avatar-circle avatar-sm">
                  <img v-if="reply.avatar" :src="reply.avatar" />
                  <span v-else class="avatar-default" style="font-size:16px">👤</span>
                </div>
                <div style="flex:1">
                  <div class="info-row" style="margin-bottom:4px">
                    <span class="post-card-username">{{ reply.nickname || '用户' }}</span>
                    <span style="font-size:11px;color:var(--text-muted)">{{ timeAgo(reply.created_at) }}</span>
                  </div>
                  <div v-if="reply.reply_to_nickname" style="font-size:12px;color:var(--text-muted);margin-bottom:4px;background:var(--bg-page);padding:2px 8px;border-radius:4px">
                    回复 @{{ reply.reply_to_nickname }}
                  </div>
                  <p style="font-size:14px;line-height:1.5;margin-bottom:4px">{{ reply.content }}</p>
                  <span @click="startReply(reply)" style="font-size:12px;color:var(--text-muted);cursor:pointer">回复</span>
                </div>
              </div>
            </template>
          </div>
        </div>

        <!-- 输入栏 -->
        <div style="position:sticky;bottom:0;padding:10px 16px;background:var(--bg-white);border-top:1px solid var(--border);padding-bottom:calc(10px + env(safe-area-inset-bottom, 0px))">
          <div v-if="replyTo" style="display:flex;align-items:center;justify-content:space-between;font-size:12px;color:var(--text-muted);margin-bottom:6px;background:var(--bg-page);padding:4px 8px;border-radius:4px">
            <span>回复 @{{ replyTo.nickname }}</span>
            <button @click="cancelReply" style="border:none;background:none;cursor:pointer;color:var(--text-muted);font-size:16px">✕</button>
          </div>
          <div class="info-row" style="gap:10px">
            <div class="input-group" style="flex:1;border-radius:20px">
              <input v-model="commentText" :placeholder="replyTo ? '回复 @' + replyTo.nickname + '...' : '写评论...'" @keydown.enter="addComment" />
            </div>
            <button class="btn btn-primary btn-sm" @click="addComment" :disabled="!commentText.trim()">发送</button>
          </div>
        </div>
      </div>
    </div>
  `
};
