/**
 * MatchAlgorithm 匹配算法单元测试
 * 纯逻辑测试，无 DB 依赖（calculateLocationScore 等为纯函数）
 */
import { describe, it, expect } from 'vitest';
import MatchAlgorithm from '../src/services/matchAlgorithm.service.js';

describe('MatchAlgorithm.calculateLocationScore', () => {
  it('同城 + 同坐标得 80 分（距离为0，无扣分）', () => {
    const a = { city: '北京', province: '北京', lat: 39.9, lng: 116.4 };
    const b = { city: '北京', province: '北京', lat: 39.9, lng: 116.4 };
    expect(MatchAlgorithm.calculateLocationScore(a, b)).toBe(80);
  });

  it('同城但距离≥15km 扣分至最低 50', () => {
    // 北京 (39.9,116.4) 与 (41.0,117.4) 约 153km，每5km扣10分 → 扣到最低 50
    const a = { city: '北京', province: '北京', lat: 39.9, lng: 116.4 };
    const b = { city: '北京', province: '北京', lat: 41.0, lng: 117.4 };
    expect(MatchAlgorithm.calculateLocationScore(a, b)).toBe(50);
  });

  it('不同城同省得 50 分', () => {
    const a = { city: '北京', province: '北京' };
    const b = { city: '北京', province: '北京' };
    expect(MatchAlgorithm.calculateLocationScore(a, b)).toBe(80); // 同城
    const c = { city: '成都', province: '四川' };
    const d = { city: '绵阳', province: '四川' };
    expect(MatchAlgorithm.calculateLocationScore(c, d)).toBe(50);
  });

  it('不同省得 20 分', () => {
    const a = { city: '北京', province: '北京' };
    const b = { city: '上海', province: '上海' };
    expect(MatchAlgorithm.calculateLocationScore(a, b)).toBe(20);
  });
});

describe('MatchAlgorithm.calculateAgeScore', () => {
  it('年龄差≤3岁得100分', () => {
    expect(MatchAlgorithm.calculateAgeScore({ age: 25 }, { age: 27 })).toBe(100);
  });
  it('年龄差5岁得80分', () => {
    expect(MatchAlgorithm.calculateAgeScore({ age: 25 }, { age: 30 })).toBe(80);
  });
  it('年龄差8岁得60分', () => {
    expect(MatchAlgorithm.calculateAgeScore({ age: 25 }, { age: 33 })).toBe(60);
  });
  it('年龄差>10岁得20分', () => {
    expect(MatchAlgorithm.calculateAgeScore({ age: 25 }, { age: 40 })).toBe(20);
  });
  it('无年龄返回中性50分', () => {
    expect(MatchAlgorithm.calculateAgeScore({}, { age: 30 })).toBe(50);
  });
});

describe('MatchAlgorithm.calculateInterestScore', () => {
  it('完全相同的标签得100分', () => {
    const user = { tags: '["旅行","美食"]' };
    expect(MatchAlgorithm.calculateInterestScore(user, { tags: '["旅行","美食"]' })).toBe(100);
  });
  it('一半交集得50分（Jaccard）', () => {
    // A={a,b}, B={b,c} → 交集1/并集3 = 33.33 → 33
    const a = { tags: '["a","b"]' };
    const b = { tags: '["b","c"]' };
    expect(MatchAlgorithm.calculateInterestScore(a, b)).toBe(33);
  });
  it('无标签返回中性50分', () => {
    expect(MatchAlgorithm.calculateInterestScore({}, { tags: '["a"]' })).toBe(50);
  });
  it('数组格式tags也能解析', () => {
    const a = { tags: ['旅行', '美食'] };
    const b = { tags: ['旅行', '摄影'] };
    // 交集1/并集3 = 33.33 → 33
    expect(MatchAlgorithm.calculateInterestScore(a, b)).toBe(33);
  });
});

describe('MatchAlgorithm.calculateVerificationScore', () => {
  it('4项认证得100分', () => {
    expect(MatchAlgorithm.calculateVerificationScore({ verification_level: 4 })).toBe(100);
  });
  it('2项认证得60分', () => {
    expect(MatchAlgorithm.calculateVerificationScore({ verification_level: 2 })).toBe(60);
  });
  it('无认证得20分', () => {
    expect(MatchAlgorithm.calculateVerificationScore({})).toBe(20);
  });
});

describe('MatchAlgorithm.calculateDistance', () => {
  it('相同坐标距离为0', () => {
    expect(MatchAlgorithm.calculateDistance(39.9, 116.4, 39.9, 116.4)).toBeLessThan(0.001);
  });
  it('北京到上海约1067km（误差±50km）', () => {
    const d = MatchAlgorithm.calculateDistance(39.9, 116.4, 31.2, 121.5);
    expect(d).toBeGreaterThan(1000);
    expect(d).toBeLessThan(1150);
  });
});

describe('MatchAlgorithm.calculateMatchScore（综合评分）', () => {
  it('完美匹配用户得分明显高于普通用户', async () => {
    const perfect = {
      city: '北京', province: '北京', lat: 39.9, lng: 116.4,
      age: 26, tags: '["旅行","美食","摄影"]',
      verification_level: 4, is_vip: true, photos_count: 6, bio: '热爱生活热爱旅行',
      popularity_score: 90
    };
    const ordinary = {
      city: '上海', province: '上海',
      age: 40, tags: '[]',
      verification_level: 0, bio: null
    };
    const r1 = await MatchAlgorithm.calculateMatchScore(perfect, perfect);
    const r2 = await MatchAlgorithm.calculateMatchScore(perfect, ordinary);
    expect(r1.score).toBeGreaterThan(r2.score);
    expect(r1.score).toBeGreaterThan(80);
    expect(r2.score).toBeLessThan(50);
  });
});
