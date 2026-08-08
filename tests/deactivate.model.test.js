/**
 * 账号注销（requestDeactivation）模型单元测试（内存降级路径）
 * User.js 是「解构引入」isDbAvailable，运行时 require 不受 vi.mock 拦截，
 * 所以采用：先 require database 模块，再直接改写其导出对象的 isDbAvailable，
 * 然后再 require User —— 此时 User 解构拿到的是改写后的函数（强制走内存降级）。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

describe('User.requestDeactivation（内存降级）', () => {
  let User, db;

  beforeEach(() => {
    delete require.cache[require.resolve('../src/models/User.js')];
    vi.resetModules();
    // 先加载 database 并改写导出，再加载 User
    db = require('../src/utils/database');
    db.isDbAvailable = () => false;
    db.executeQuery = async () => [[], []];
    db.cacheGet = async () => null;
    db.cacheSet = async () => {};
    db.cacheDel = async () => {};
    User = require('../src/models/User');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    // 恢复原始导出（避免污染其他测试文件）
    if (db) {
      db.isDbAvailable = db.__origIsDbAvailable || db.isDbAvailable;
    }
  });

  it('注销后 status=0，token 应被登录/中间件拦截', async () => {
    const u = await User.create({ phone: '13800000000', nickname: '注销测试' });
    expect(u).not.toBeNull();
    expect(u.status).toBe(1);

    const deactivated = await User.requestDeactivation(u.id);
    expect(deactivated).not.toBeNull();
    expect(deactivated.status).toBe(0);
    expect(deactivated.deactivation_requested_at).toBeInstanceOf(Date);

    const reloaded = await User.findById(u.id);
    expect(reloaded.status).toBe(0);
  });

  it('注销后 findById 返回的用户 status=0，可被 auth 校验拒绝', async () => {
    const u = await User.create({ phone: '13800000001', nickname: '注销测试2' });
    await User.requestDeactivation(u.id);
    const after = await User.findById(u.id);
    expect(after.status === 1).toBe(false);
  });
});
