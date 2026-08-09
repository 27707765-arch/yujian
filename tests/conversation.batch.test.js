/**
 * 会话批量删除（Conversation.batchSoftDelete）单元测试
 * Conversation.js 是 CJS require('../utils/database')，运行时不受 vi.mock 拦截，
 * 且 require 时解构 executeQuery/isDbAvailable 的【引用】。因此：
 * - beforeEach 改写 db.executeQuery 为一个委托函数（读可变 mockExec），再 require Conversation
 * - 各测试通过改 mockExec 控制 executeQuery 行为（无需重新 require）
 * 验证：
 * - 数据库可用：批量软删 SQL 归属校验 + 返回删除数（affectedRows 从首层 rows 取）
 * - 参数过滤：非法/空 ID 过滤
 * - 空数组：直接返回 0
 * - 数据库不可用：走内存降级路径
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

describe('Conversation.batchSoftDelete', () => {
  let Conversation, db, mockExec;

  beforeEach(() => {
    delete require.cache[require.resolve('../src/models/Conversation.js')];
    vi.resetModules();
    db = require('../src/utils/database');
    // 默认数据库可用，executeQuery 委托给 mockExec
    db.isDbAvailable = () => true;
    mockExec = async () => [{ affectedRows: 0 }, []];
    db.executeQuery = (...args) => mockExec(...args);
    Conversation = require('../src/models/Conversation');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('数据库可用：批量软删成功，返回删除数（affectedRows 从首层 rows 取）', async () => {
    mockExec = async () => [{ affectedRows: 3 }, []];
    const count = await Conversation.batchSoftDelete([1, 2, 3], 7);
    expect(count).toBe(3);
  });

  it('SQL 含归属校验（user1_id = ? OR user2_id = ?）', async () => {
    let captured;
    mockExec = async (sql, params) => { captured = { sql, params }; return [{ affectedRows: 2 }, []]; };
    await Conversation.batchSoftDelete([1, 2], 7);
    expect(captured.sql).toContain('UPDATE conversations SET is_deleted_by_user');
    expect(captured.sql).toContain('id IN (?,?)');
    expect(captured.sql).toContain('user1_id = ? OR user2_id = ?');
    expect(captured.params).toEqual([7, 1, 2, 7, 7]);
  });

  it('过滤非法 ID（非数字/<=0/小数/NaN）', async () => {
    let captured;
    mockExec = async (sql, params) => { captured = { sql, params }; return [{ affectedRows: 1 }, []]; };
    const count = await Conversation.batchSoftDelete([1, 'a', 0, -5, 2.5, null, undefined], 7);
    expect(count).toBe(1);
    // 只有 1 被保留为合法 ID
    expect(captured.params).toEqual([7, 1, 7, 7]);
  });

  it('空数组：不执行 SQL，直接返回 0', async () => {
    const calls = [];
    mockExec = async (...args) => { calls.push(args); return [{ affectedRows: 0 }, []]; };
    const count = await Conversation.batchSoftDelete([], 7);
    expect(count).toBe(0);
    expect(calls.length).toBe(0);
  });

  it('未传数组：返回 0', async () => {
    const count = await Conversation.batchSoftDelete(undefined, 7);
    expect(count).toBe(0);
  });

  it('数据库不可用：走内存降级路径，不抛错', async () => {
    db.isDbAvailable = () => false;
    db.executeQuery = async () => [[], []];
    const count = await Conversation.batchSoftDelete([1], 7);
    expect(typeof count).toBe('number');
  });
});
