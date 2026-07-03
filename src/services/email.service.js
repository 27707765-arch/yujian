/**
 * 邮箱服务
 * 用于发送和验证邮箱验证码
 * 支持 SMTP 真实发送 + 模拟模式（内测用固定验证码）
 */
const nodemailer = require('nodemailer');
const redis = require('../config/redis');

// 内存存储 (Redis 不可用时降级)
const memoryStore = new Map();

// SMTP 配置
const SMTP_CONFIG = {
  host: process.env.SMTP_HOST || 'smtp.qq.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: parseInt(process.env.SMTP_PORT || '587') === 465, // 465端口使用SSL
  auth: {
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || ''
  }
};

const FROM_NAME = process.env.SMTP_FROM_NAME || '遇见APP';
const FROM_ADDR = SMTP_CONFIG.auth.user;

function buildEmailHtml(code, expiryMinutes = 5) {
  return `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;background:#f5f5f5;margin:0;padding:32px 0"><div style="max-width:480px;margin:0 auto;padding:32px 20px;background:#fff;border-radius:12px;text-align:center"><div style="font-size:48px;margin-bottom:16px">&#x1F495;</div><h2 style="color:#FF6B6B;margin-bottom:8px">遇见APP</h2><p style="color:#636E72;font-size:14px;margin-bottom:24px">邮箱验证码</p><div style="background:#FFF5F5;border-radius:12px;padding:20px;margin-bottom:24px"><span style="font-size:36px;font-weight:700;letter-spacing:8px;color:#FF6B6B">${code}</span></div><p style="color:#B2BEC3;font-size:12px">验证码 ${expiryMinutes} 分钟内有效，请勿泄露给他人</p><hr style="border:none;border-top:1px solid #E9ECEF;margin:24px 0"><p style="color:#B2BEC3;font-size:11px">如果这不是你的操作，请忽略此邮件</p></div></body></html>`;
}

function isSimulateMode() {
  // 生产环境若配置了SMTP则真实发送，否则模拟
  // 非生产环境默认模拟
  if (process.env.EMAIL_SIMULATE === 'true') return true;
  if (process.env.EMAIL_SIMULATE === 'false') return false;
  if (!SMTP_CONFIG.auth.user) return true; // 无SMTP配置 → 模拟
  return false;
}

let _transporter = null;
function getTransporter() {
  if (!_transporter && SMTP_CONFIG.auth.user) {
    _transporter = nodemailer.createTransport(SMTP_CONFIG);
  }
  return _transporter;
}

function generateCode() {
  if (isSimulateMode()) {
    console.warn('[邮箱] 模拟模式：验证码固定为 123456');
    return '123456';
  }
  return String(Math.floor(100000 + Math.random() * 900000));
}

function cleanupExpired() {
  const now = Date.now();
  for (const [key, data] of memoryStore.entries()) {
    if (now > data.expireTime) memoryStore.delete(key);
  }
}

async function sendVerificationCode(email) {
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { success: false, message: '邮箱格式错误' };
  }

  const code = generateCode();

  // 存储到 Redis 或内存
  try {
    const redisAvailable = await redis.ensureConnected();
    if (redisAvailable) {
      const client = redis.getClient();
      await client.set(`email:code:${email}`, code, { EX: 300 });
    } else {
      cleanupExpired();
      memoryStore.set(email, { code, expireTime: Date.now() + 300000 });
    }
  } catch (err) {
    cleanupExpired();
    memoryStore.set(email, { code, expireTime: Date.now() + 300000 });
  }

  // 模拟模式直接返回
  if (isSimulateMode()) {
    console.log(`[邮箱模拟] 向 ${email} 发送验证码：${code}`);
    return { success: true, message: '验证码发送成功', code };
  }

  // 真实SMTP发送
  const transporter = getTransporter();
  if (!transporter) {
    return { success: false, message: '邮件服务未配置' };
  }

  try {
    await transporter.sendMail({
      from: `"${FROM_NAME}" <${FROM_ADDR}>`,
      to: email,
      subject: `【${FROM_NAME}】邮箱验证码 ${code}`,
      html: buildEmailHtml(code, 5)
    });
    console.log(`[邮箱] 验证码已发送到 ${email}`);
    return { success: true, message: '验证码已发送，请查收邮件' };
  } catch (err) {
    console.error(`[邮箱] 发送失败: ${err.message}`);
    return { success: false, message: '邮件发送失败' };
  }
}

async function verifyCode(email, code) {
  if (!code) return false;
  try {
    const redisAvailable = await redis.ensureConnected();
    if (redisAvailable) {
      const client = redis.getClient();
      const stored = await client.get(`email:code:${email}`);
      if (stored === code) { await client.del(`email:code:${email}`); return true; }
      return false;
    }
  } catch (err) { /* 降级 */ }

  cleanupExpired();
  const record = memoryStore.get(email);
  if (record && record.code === code) { memoryStore.delete(email); return true; }
  return false;
}

module.exports = { sendVerificationCode, verifyCode, isSimulateMode };
