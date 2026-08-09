/**
 * 后台行为聚合纯函数单元测试
 * 直接测试 admin.user.controller.js 导出的纯函数：
 * - normalizeBehaviorRow：方向判定 / peer 提取 / 关联字段归一
 * - mergeAndSortBehaviors：合并 / 时间倒序 / limit 截断
 * - 常量完整性：BEHAVIOR_TYPE_LABELS / SLIDE_ACTION_LABELS
 * 无 DB 依赖（符合项目纯逻辑测试文化，仿 view.aggregate.test.js）。
 */
import { describe, it, expect } from 'vitest';
import {
  normalizeBehaviorRow,
  mergeAndSortBehaviors,
  BEHAVIOR_TYPE_LABELS,
  SLIDE_ACTION_LABELS
} from '../src/controllers/admin.user.controller.js';

const T = 1722660000000; // 基准时间戳

describe('normalizeBehaviorRow', () => {
  it('从 target_user_id 提取 peer（查看/喜欢/滑动维度）', () => {
    const row = { target_user_id: 5, peer_nickname: '小明', peer_avatar: '/uploads/a.png', created_at: new Date(T) };
    const r = normalizeBehaviorRow(row, 'view', 'sent');
    expect(r.dim).toBe('view');
    expect(r.direction).toBe('sent');
    expect(r.peer.id).toBe(5);
    expect(r.peer.nickname).toBe('小明');
  });

  it('从显式 peer_id 提取 peer（消息维度）', () => {
    const row = { peer_id: 9, peer_nickname: '小红', message_preview: '你好', created_at: new Date(T) };
    const r = normalizeBehaviorRow(row, 'message', 'received');
    expect(r.peer.id).toBe(9);
    expect(r.message_preview).toBe('你好');
  });

  it('关联动态信息正确挂载（点赞/评论维度）', () => {
    const row = { peer_id: 3, post: { id: 88, content: '今天天气不错' }, comment_content: '赞一个', created_at: new Date(T) };
    const r = normalizeBehaviorRow(row, 'comment', 'sent');
    expect(r.post.id).toBe(88);
    expect(r.comment_content).toBe('赞一个');
  });

  it('null 输入返回 null', () => {
    expect(normalizeBehaviorRow(null, 'view', 'sent')).toBeNull();
  });

  it('无对端字段时 peer.id 用 peer_id 兜底', () => {
    const r = normalizeBehaviorRow({ peer_id: 7, created_at: new Date(T) }, 'match', 'sent');
    expect(r.peer.id).toBe(7);
  });
});

describe('mergeAndSortBehaviors', () => {
  it('合并多个列表并按时间倒序', () => {
    const a = [{ id: 1, created_at: new Date(T) }];
    const b = [{ id: 2, created_at: new Date(T - 5000) }];
    const c = [{ id: 3, created_at: new Date(T - 2000) }];
    const merged = mergeAndSortBehaviors([a, b, c]);
    expect(merged.map(x => x.id)).toEqual([1, 3, 2]);
  });

  it('limit 截断生效', () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({ id: i, created_at: new Date(T - i * 1000) }));
    const merged = mergeAndSortBehaviors([rows], 3);
    expect(merged.length).toBe(3);
    expect(merged[0].id).toBe(0); // 最新
  });

  it('空输入与 null 列表安全', () => {
    expect(mergeAndSortBehaviors([])).toEqual([]);
    expect(mergeAndSortBehaviors([null, undefined, []])).toEqual([]);
  });

  it('过滤空项', () => {
    const merged = mergeAndSortBehaviors([[null], [{ id: 1, created_at: new Date(T) }]]);
    expect(merged.length).toBe(1);
  });
});

describe('常量完整性', () => {
  it('行为类型中文标签覆盖全部维度', () => {
    const dims = ['view_profile', 'like_user', 'like_post', 'comment_post', 'message_send', 'message_recv', 'match', 'slide'];
    for (const d of dims) {
      expect(BEHAVIOR_TYPE_LABELS[d], `缺少 ${d} 的中文标签`).toBeTruthy();
    }
  });

  it('滑动操作中文映射', () => {
    expect(SLIDE_ACTION_LABELS.like).toBe('喜欢');
    expect(SLIDE_ACTION_LABELS.skip).toBe('跳过');
    expect(SLIDE_ACTION_LABELS.super_like).toBe('超级喜欢');
  });
});
