/**
 * 内容审核服务单元测试
 * 纯逻辑测试（checkSensitiveContent / filterSensitiveContent）
 */
import { describe, it, expect } from 'vitest';
import contentAudit from '../src/services/contentAudit.service.js';

describe('contentAudit.checkSensitiveContent', () => {
  it('正常内容通过审核', () => {
    const r = contentAudit.checkSensitiveContent('今天天气真好，一起去公园散步吧');
    expect(r.pass).toBe(true);
  });

  it('检测到中文敏感词被拦截并返回该词', () => {
    const r = contentAudit.checkSensitiveContent('需要办理证件吗？代开发票');
    expect(r.pass).toBe(false);
    expect(r.sensitiveWord).toBe('代开发票');
  });

  it('检测到英文敏感词（小写）', () => {
    const r = contentAudit.checkSensitiveContent('you are such a fuck');
    expect(r.pass).toBe(false);
  });

  it('英文敏感词大小写敏感（大写不命中 includes）', () => {
    // checkSensitiveContent 用 String.includes（大小写敏感），大写不命中
    const r = contentAudit.checkSensitiveContent('you are such a FUCK');
    expect(r.pass).toBe(true);
    // filterSensitiveContent 用正则 gi 模式，大小写不敏感可过滤
    const filtered = contentAudit.filterSensitiveContent('you are such a FUCK');
    expect(filtered).not.toContain('FUCK');
  });

  it('null/undefined 跳过审核', () => {
    expect(contentAudit.checkSensitiveContent(null).pass).toBe(true);
    expect(contentAudit.checkSensitiveContent(undefined).pass).toBe(true);
  });

  it('非字符串内容（数字/对象）被拒绝', () => {
    expect(contentAudit.checkSensitiveContent(123).pass).toBe(false);
    expect(contentAudit.checkSensitiveContent({}).pass).toBe(false);
  });

  it('空白字符串放行', () => {
    expect(contentAudit.checkSensitiveContent('   ').pass).toBe(true);
  });
});

describe('contentAudit.filterSensitiveContent', () => {
  it('敏感词被替换为等长*号', () => {
    const filtered = contentAudit.filterSensitiveContent('这里有赌博广告');
    expect(filtered).toContain('**');
    expect(filtered).not.toContain('赌博');
  });

  it('无敏感词内容原样返回', () => {
    const msg = '正常聊天内容';
    expect(contentAudit.filterSensitiveContent(msg)).toBe(msg);
  });

  it('非字符串返回原值', () => {
    expect(contentAudit.filterSensitiveContent(null)).toBeNull();
    expect(contentAudit.filterSensitiveContent(123)).toBe(123);
  });
});
