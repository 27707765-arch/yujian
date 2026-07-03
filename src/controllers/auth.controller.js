/**
 * 认证控制器
 * 支持 手机验证码 + 邮箱验证码 双通道登录
 */
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const smsService = require('../services/sms.service');
const emailService = require('../services/email.service');
const antifraudService = require('../services/antifraud.service');
const { success, error, serverError } = require('../utils/response');
const { executeQuery } = require('../utils/database');

// ==================== 自动随机昵称生成 ====================
const ADJECTIVES = [
  '甜心', '追风', '慵懒', '元气', '温柔',
  '暴躁', '社恐', '话痨', '佛系', '野生',
  '迷路', '假装', '认真', '偶尔', '偷偷'
];
const NOUNS = [
  '小鹿', '橘猫', '布丁', '汽水', '薯片',
  '椰子', '月亮', '云朵', '风筝', '薄荷',
  '柚子', '芝士', '海盐', '樱桃', '奶盖',
  '芋圆', '年糕', '汤圆', '豆腐', '烤鱼',
  '北极星', '企鹅', '考拉', '柴犬', '蜜獾',
  '树懒', '鹦鹉', '浣熊', '水母', '海豚'
];

function generateNickname() {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  const num = String(Math.floor(Math.random() * 99) + 1).padStart(2, '0');
  return `${adj}的${noun}${num}`;
}

async function generateUniqueNickname() {
  for (let i = 0; i < 20; i++) {
    const nickname = generateNickname();
    try {
      const rows = await executeQuery('SELECT id FROM users WHERE nickname = ? LIMIT 1', [nickname]);
      if (!rows || rows.length === 0) return nickname;
    } catch (err) {
      return nickname;
    }
  }
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  const num = Math.floor(Math.random() * 9999) + 100;
  return `${adj}的${noun}${num}`;
}

// 构建JWT token
function buildToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, phone: user.phone, role: user.role || 'user' },
    process.env.JWT_SECRET || 'your_jwt_secret_key',
    { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
  );
}

// 构建用户响应体
function buildUserResponse(user) {
  return {
    id: user.id, phone: user.phone, email: user.email,
    nickname: user.nickname, avatar: user.avatar,
    gender: user.gender, age: user.age, height: user.height,
    occupation: user.occupation, location: user.location,
    bio: user.bio, is_vip: user.is_vip,
    vip_expire_time: user.vip_expire_time,
    role: user.role || 'user',
    onboarding_completed: !!(user.nickname && user.gender !== null)
  };
}

// ==================== 发送验证码 ====================

/**
 * POST /api/auth/send-code
 * body: { phone, email }
 * 至少提供 phone 或 email 之一
 */
async function sendCode(req, res) {
  try {
    const { phone, email } = req.body;

    // 邮箱通道
    if (email) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return error(res, 400, '邮箱格式错误');
      }
      const result = await emailService.sendVerificationCode(email);
      if (!result.success) return error(res, 500, result.message);
      return success(res, {
        channel: 'email',
        code: result.code || null
      }, result.message);
    }

    // 手机通道（默认）
    if (phone) {
      if (!/^1[3-9]\d{9}$/.test(phone)) {
        return error(res, 400, '手机号格式错误');
      }
      const result = await smsService.sendVerificationCode(phone);
      if (!result.success) return error(res, 500, result.message);
      return success(res, {
        channel: 'phone',
        code: result.code || null
      }, result.message);
    }

    return error(res, 400, '请提供手机号或邮箱');
  } catch (err) {
    serverError(res, err, '发送验证码失败');
  }
}

// ==================== 登录/注册 ====================

/**
 * POST /api/auth/login
 * body: { login, code }
 * login 可以是手机号或邮箱，自动识别
 */
async function login(req, res) {
  try {
    const { login, code } = req.body;

    if (!login) return error(res, 400, '请输入手机号或邮箱');
    if (!code || typeof code !== 'string' || code.length < 4) {
      return error(res, 400, '请输入验证码');
    }

    // 判断登录方式
    const isEmail = login.includes('@');
    let user;

    if (isEmail) {
      // 邮箱登录
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(login)) {
        return error(res, 400, '邮箱格式错误');
      }
      const isValid = await emailService.verifyCode(login, code);
      if (!isValid) return error(res, 400, '验证码错误');

      user = await User.findByEmail(login);
      if (!user) {
        // 自动注册
        const autoNickname = await generateUniqueNickname();
        user = await User.create({
          email: login,
          phone: null,
          nickname: autoNickname,
          email_verified: 1
        });
      }
    } else {
      // 手机登录
      if (!/^1[3-9]\d{9}$/.test(login)) {
        return error(res, 400, '手机号格式错误');
      }
      const isValid = await smsService.verifyCode(login, code);
      if (!isValid) return error(res, 400, '验证码错误');

      user = await User.findByPhone(login);
      if (!user) {
        const clientIp = req.ip || req.connection.remoteAddress;
        const riskCheck = await antifraudService.checkRegistration(clientIp, login);
        if (riskCheck.blocked) {
          console.warn(`注册被反欺诈拦截: IP=${clientIp}, 手机=${login}`);
          return error(res, 403, '注册受限，请联系客服');
        }
        const autoNickname = await generateUniqueNickname();
        user = await User.create({
          phone: login,
          email: null,
          nickname: autoNickname
        });
      }
    }

    if (user.status === 0) {
      return error(res, 403, '账号已被禁用，请联系客服');
    }

    const token = buildToken(user);
    success(res, { token, user: buildUserResponse(user) }, '登录成功');
  } catch (err) {
    serverError(res, err, '登录失败');
  }
}

// ==================== 设置密码 ====================

/**
 * POST /api/auth/set-password
 * body: { password }
 * 已登录用户设置密码（用于后续密码登录）
 */
async function setPassword(req, res) {
  try {
    const { id } = req.user;
    const { password } = req.body;
    if (!password || password.length < 6) {
      return error(res, 400, '密码至少6位');
    }
    const hash = await bcrypt.hash(password, 10);
    await User.update(id, { password_hash: hash });
    success(res, null, '密码设置成功');
  } catch (err) {
    serverError(res, err, '设置密码失败');
  }
}

/**
 * POST /api/auth/bind-email
 * body: { email, code }
 * 已登录手机用户绑定邮箱
 */
async function bindEmail(req, res) {
  try {
    const { id } = req.user;
    const { email, code } = req.body;
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return error(res, 400, '邮箱格式错误');
    }
    // 检查邮箱是否已被其他用户绑定
    const existing = await User.findByEmail(email);
    if (existing && existing.id !== id) {
      return error(res, 409, '该邮箱已被绑定');
    }
    const isValid = await emailService.verifyCode(email, code);
    if (!isValid) return error(res, 400, '验证码错误');
    await User.update(id, { email, email_verified: 1 });
    success(res, { email }, '邮箱绑定成功');
  } catch (err) {
    serverError(res, err, '绑定邮箱失败');
  }
}

module.exports = {
  sendCode,
  login,
  setPassword,
  bindEmail
};
