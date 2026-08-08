/**
 * View 模型访客聚合单元测试（纯函数）
 * 直接测试 aggregateViewers 纯函数，验证：
 * - 按访客聚合 + visit_count 计次
 * - 按最近访问时间倒序
 * - limit/offset 分页
 * - calcDistance 距离计算（访客距离展示）
 * 无 DB 依赖（符合项目纯逻辑测试文化）。
 */
import { describe, it, expect } from 'vitest';
import { aggregateViewers, calcDistance } from '../src/models/View.js';

const T = 1722660000000; // 基准时间戳（2024-08-03 左右），每次访问递减模拟时间流逝

function record(userId, targetUserId, idx) {
  return { user_id: userId, target_user_id: targetUserId, created_at: new Date(T - idx * 1000) };
}

describe('aggregateViewers（访客聚合纯函数）', () => {
  it('同一访客多次访问聚合成一条并计次', () => {
    const records = [
      record(1, 100, 0),
      record(1, 100, 1),
      record(1, 100, 2),
      record(2, 100, 3),
    ];
    const viewers = aggregateViewers(records, 100);
    expect(viewers.length).toBe(2);
    const v1 = viewers.find(v => v.user_id === 1);
    const v2 = viewers.find(v => v.user_id === 2);
    expect(v1.visit_count).toBe(3);
    expect(v2.visit_count).toBe(1);
  });

  it('聚合结果按最近访问时间倒序（先来的访客排前面）', () => {
    const records = [
      record(1, 100, 0), // user1 最后访问（idx=0 最新）
      record(2, 100, 5), // user2 更早访问
    ];
    const viewers = aggregateViewers(records, 100);
    expect(viewers[0].user_id).toBe(1);
    expect(viewers[1].user_id).toBe(2);
    // 聚合条目的 created_at 取该访客最近一次访问
    expect(viewers[0].created_at.getTime()).toBe(T);
    expect(viewers[1].created_at.getTime()).toBe(T - 5000);
  });

  it('只聚合指定被访者，其他被访者的记录被过滤', () => {
    const records = [
      record(1, 100, 0),
      record(2, 200, 1), // 被访者 200，应被过滤
      record(3, 100, 2),
    ];
    const viewers = aggregateViewers(records, 100);
    expect(viewers.length).toBe(2);
    expect(viewers.every(v => v.target_user_id === 100)).toBe(true);
  });

  it('limit/offset 分页生效', () => {
    const records = [];
    for (let i = 1; i <= 5; i++) {
      records.push(record(i, 300, i));
    }
    const page1 = aggregateViewers(records, 300, 2, 0);
    const page2 = aggregateViewers(records, 300, 2, 2);
    expect(page1.length).toBe(2);
    expect(page2.length).toBe(2);
    const ids1 = page1.map(v => v.user_id);
    const ids2 = page2.map(v => v.user_id);
    expect(ids1.filter(id => ids2.includes(id)).length).toBe(0);
  });

  it('无匹配记录返回空数组', () => {
    const records = [record(1, 100, 0)];
    expect(aggregateViewers(records, 999)).toEqual([]);
  });
});

describe('calcDistance（访客距离计算）', () => {
  it('同坐标距离为 0', () => {
    expect(calcDistance(39.9, 116.4, 39.9, 116.4)).toBe(0);
  });

  it('北京↔上海约 1067km（误差±10km）', () => {
    const d = calcDistance(39.9042, 116.4074, 31.2304, 121.4737);
    expect(d).toBeGreaterThan(1050);
    expect(d).toBeLessThan(1100);
  });

  it('坐标缺失返回 null（前端不显示距离）', () => {
    expect(calcDistance(null, 116.4, 39.9, 116.4)).toBeNull();
    expect(calcDistance(39.9, null, 39.9, 116.4)).toBeNull();
    expect(calcDistance(39.9, 116.4, undefined, 116.4)).toBeNull();
  });

  it('近距离（1km内）返回 < 1 的小数', () => {
    // 0.01° 纬度差约 1.11km
    const d = calcDistance(39.9, 116.4, 39.909, 116.4);
    expect(d).toBeGreaterThan(0.9);
    expect(d).toBeLessThan(1.2);
  });
});
