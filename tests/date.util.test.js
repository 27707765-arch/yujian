/**
 * 日期工具模块单元测试（纯函数）
 * 验证 formatBirthDate 与 calcAgeFromBirth：
 * - mysql2 默认将 DATE 列解析为 JS Date，JSON 序列化后变 UTC ISO 串
 * - formatBirthDate 需还原为本地日历 'YYYY-MM-DD'，避免回显乱码与回传校验失败
 * - calcAgeFromBirth 周岁计算含生日边界
 * 无 DB 依赖（符合项目纯逻辑测试文化）。
 */
import { describe, it, expect } from 'vitest';
import { formatBirthDate, calcAgeFromBirth } from '../src/utils/date.js';

describe('formatBirthDate（出生日期格式化）', () => {
  it('Date 对象还原为本地日历 YYYY-MM-DD（不丢日期）', () => {
    const d = new Date(1987, 1, 28); // 1987-02-28 本地午夜
    expect(formatBirthDate(d)).toBe('1987-02-28');
  });

  it('Date 对象经 JSON 序列化（UTC ISO 串）后仍还原为同一本地日期', () => {
    // 模拟 mysql2 实际链路：DATE 列 → JS Date → JSON.stringify → UTC ISO 串
    const local = new Date(1987, 1, 28); // 1987-02-28 本地日历
    const iso = JSON.stringify({ birth_date: local }); // 序列化为 UTC ISO 串
    const back = JSON.parse(iso).birth_date; // "1987-02-27T16:00:00.000Z"（UTC+8）或含 UTC 前缀
    expect(formatBirthDate(back)).toBe('1987-02-28');
  });

  it('已格式化的 YYYY-MM-DD 字符串原样返回（不引入时区偏移）', () => {
    expect(formatBirthDate('1990-06-15')).toBe('1990-06-15');
  });

  it('DATETIME 格式字符串（带时分秒）只取日期部分', () => {
    expect(formatBirthDate('1990-06-15 08:30:00')).toBe('1990-06-15');
  });

  it('空值/非法输入返回 null', () => {
    expect(formatBirthDate(null)).toBeNull();
    expect(formatBirthDate(undefined)).toBeNull();
    expect(formatBirthDate('not-a-date')).toBeNull();
    expect(formatBirthDate('')).toBeNull();
    expect(formatBirthDate('1987-13-45')).toBeNull();
  });
});

describe('calcAgeFromBirth（周岁计算）', () => {
  it('生日未到返回正确的周岁（减1岁）', () => {
    // 以当天为基准：出生日期设为今天恰好19年前的明天 → 应为18周岁
    const now = new Date();
    const past = new Date(now.getFullYear() - 19, now.getMonth(), now.getDate() + 1);
    const y = past.getFullYear();
    const m = String(past.getMonth() + 1).padStart(2, '0');
    const d = String(past.getDate()).padStart(2, '0');
    expect(calcAgeFromBirth(`${y}-${m}-${d}`)).toBe(18);
  });

  it('生日已过返回整数周岁', () => {
    const now = new Date();
    const past = new Date(now.getFullYear() - 19, now.getMonth(), now.getDate() - 1);
    const y = past.getFullYear();
    const m = String(past.getMonth() + 1).padStart(2, '0');
    const d = String(past.getDate()).padStart(2, '0');
    expect(calcAgeFromBirth(`${y}-${m}-${d}`)).toBe(19);
  });

  it('未来日期返回 -1', () => {
    const now = new Date();
    const future = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate());
    const y = future.getFullYear();
    const m = String(future.getMonth() + 1).padStart(2, '0');
    const d = String(future.getDate()).padStart(2, '0');
    expect(calcAgeFromBirth(`${y}-${m}-${d}`)).toBe(-1);
  });

  it('非法日期返回 -1', () => {
    expect(calcAgeFromBirth('invalid')).toBe(-1);
    expect(calcAgeFromBirth('')).toBe(-1);
  });
});
