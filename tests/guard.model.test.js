/**
 * Guard 模型单元测试（内存降级路径）
 * 采用 call.handler.test.js 的模式：createRequire 加载真实 CJS 单例模块，
 * 再 vi.spyOn 替换 isDbAvailable 强制走内存降级（不依赖 vi.mock 拦截 CJS require）。
 * 每次 beforeEach 用 resetModules 重新加载模块，清空模块级内存存储，保证测试隔离。
 * 验证：幂等守护 / 取消 / 列表 / 计数 / 分页。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

describe('Guard 模型（内存降级）', () => {
  let Guard, db;

  beforeEach(() => {
    // 删除 CJS require 缓存，重新加载 Guard 模块以清空模块级内存存储（resetModules 只清 ESM）
    delete require.cache[require.resolve('../src/models/Guard.js')];
    vi.resetModules();
    db = require('../src/utils/database');
    Guard = require('../src/models/Guard');
    // 强制数据库不可用 → 模型走内存降级
    vi.spyOn(db, 'isDbAvailable').mockReturnValue(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('守护一个用户成功，返回记录', async () => {
    const rec = await Guard.create(1, 2);
    expect(rec).toBeTruthy();
    expect(rec.guard_user_id).toBe(1);
    expect(rec.guarded_user_id).toBe(2);
  });

  it('重复守护幂等：第二次返回 null，不重复计数', async () => {
    await Guard.create(1, 2);
    const again = await Guard.create(1, 2);
    expect(again).toBeNull();
    expect(await Guard.countGuarding(1)).toBe(1);
    expect(await Guard.countGuarders(2)).toBe(1);
  });

  it('不能守护自己', async () => {
    await expect(Guard.create(1, 1)).rejects.toThrow('不能守护自己');
  });

  it('列表：我守护的 / 守护我的', async () => {
    await Guard.create(1, 2);
    await Guard.create(3, 2);
    await Guard.create(1, 4);

    const guarding = await Guard.getGuarding(1);
    expect(guarding.length).toBe(2);
    expect(guarding.map(g => g.guarded_user_id).sort()).toEqual([2, 4]);

    const guarders = await Guard.getGuarders(2);
    expect(guarders.length).toBe(2);
    expect(guarders.map(g => g.guard_user_id).sort()).toEqual([1, 3]);
  });

  it('取消守护后计数与列表同步', async () => {
    await Guard.create(1, 2);
    expect(await Guard.exists(1, 2)).toBe(true);
    const removed = await Guard.remove(1, 2);
    expect(removed).toBe(true);
    expect(await Guard.exists(1, 2)).toBe(false);
    expect(await Guard.countGuarders(2)).toBe(0);
    expect(await Guard.getGuarding(1)).toEqual([]);
  });

  it('取消不存在的守护返回 false', async () => {
    expect(await Guard.remove(99, 100)).toBe(false);
  });

  it('分页：limit/offset 生效', async () => {
    await Guard.create(1, 10);
    await Guard.create(1, 11);
    await Guard.create(1, 12);
    const page1 = await Guard.getGuarding(1, 2, 0);
    expect(page1.length).toBe(2);
    const page2 = await Guard.getGuarding(1, 2, 2);
    expect(page2.length).toBe(1);
    expect(page1[0].guarded_user_id).not.toBe(page2[0].guarded_user_id);
  });
});
