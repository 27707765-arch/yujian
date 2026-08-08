/**
 * 上传 URL 归一化工具单元测试
 * 覆盖 src/utils/upload.js 的 normalizeUploadUrl / normalizeUploadUrls
 * 纯函数测试，无 DB/IO 依赖。
 */
import { describe, it, expect } from 'vitest';
import { normalizeUploadUrl, normalizeUploadUrls, parseImagesField } from '../src/utils/upload.js';

describe('normalizeUploadUrl', () => {
  it('裸路径 /xxx 补 /uploads/ 前缀', () => {
    expect(normalizeUploadUrl('/abc.png')).toBe('/uploads/abc.png');
    expect(normalizeUploadUrl('/avatar-123.jpg')).toBe('/uploads/avatar-123.jpg');
  });

  it('/uploads/xxx 原样返回', () => {
    expect(normalizeUploadUrl('/uploads/abc.png')).toBe('/uploads/abc.png');
  });

  it('http(s) 绝对 URL 原样返回', () => {
    expect(normalizeUploadUrl('https://api.dicebear.com/7.x/svg')).toBe('https://api.dicebear.com/7.x/svg');
    expect(normalizeUploadUrl('http://cdn.example.com/x.png')).toBe('http://cdn.example.com/x.png');
  });

  it('data: URI 原样返回', () => {
    expect(normalizeUploadUrl('data:image/png;base64,xxx')).toMatch(/^data:/);
  });

  it('null/undefined/空串 原样返回', () => {
    expect(normalizeUploadUrl(null)).toBeNull();
    expect(normalizeUploadUrl(undefined)).toBeUndefined();
    expect(normalizeUploadUrl('')).toBe('');
    expect(normalizeUploadUrl('   ')).toBe('');
  });

  it('非字符串（数字/对象）原样返回', () => {
    expect(normalizeUploadUrl(123)).toBe(123);
    const obj = { a: 1 };
    expect(normalizeUploadUrl(obj)).toBe(obj);
  });
});

describe('normalizeUploadUrls', () => {
  it('数组逐项归一', () => {
    expect(normalizeUploadUrls(['/a.png', '/uploads/b.png', 'https://x.com/c.png'])).toEqual([
      '/uploads/a.png',
      '/uploads/b.png',
      'https://x.com/c.png',
    ]);
  });

  it('非数组原样返回', () => {
    expect(normalizeUploadUrls(null)).toBeNull();
    expect(normalizeUploadUrls(undefined)).toBeUndefined();
    expect(normalizeUploadUrls('string')).toBe('string');
  });

  it('空数组返回空数组', () => {
    expect(normalizeUploadUrls([])).toEqual([]);
  });
});

describe('parseImagesField', () => {
  it('已是数组（MySQL JSON列已解析）：直接归一', () => {
    expect(parseImagesField(['/a.png', '/uploads/b.png'])).toEqual(['/uploads/a.png', '/uploads/b.png']);
  });

  it('JSON 字符串数组：解析并归一', () => {
    expect(parseImagesField('["/a.png","/uploads/b.png"]')).toEqual(['/uploads/a.png', '/uploads/b.png']);
  });

  it('裸路径字符串（历史遗留单图）：包成数组并归一', () => {
    expect(parseImagesField('/uploads/a.png')).toEqual(['/uploads/a.png']);
    expect(parseImagesField('/a.png')).toEqual(['/uploads/a.png']);
  });

  it('非法 JSON 字符串：返回空数组', () => {
    expect(parseImagesField('/not-a-json')).toEqual(['/uploads/not-a-json']);
    expect(parseImagesField('{invalid json')).toEqual([]);
  });

  it('null/undefined/空：返回空数组', () => {
    expect(parseImagesField(null)).toEqual([]);
    expect(parseImagesField(undefined)).toEqual([]);
    expect(parseImagesField('')).toEqual([]);
  });
});
