/**
 * 认证控制器
 * 处理用户认证相关的HTTP请求，包括发送验证码和登录/注册
 */

const jwt = require('jsonwebtoken');
const User = require('../models/User');
const smsService = require('../services/sms.service');
const antifraudService = require('../services/antifraud.service');
const { success, error, serverError } = require('../utils/response');

/**
 * 发送验证码
 * @param {Object} req - Express请求对象
 * @param {Object} res - Express响应对象
 */
async function sendCode(req, res) {
  try {
    const { phone } = req.body;

    // 验证手机号格式
    if (!/^1[3-9]\d{9}$/.test(phone)) {
      return error(res, 400, '手机号格式错误');
    }

    // 发送验证码
    const result = await smsService.sendVerificationCode(phone);

    if (!result.success) {
      return error(res, 500, result.message);
    }

    // 开发环境返回验证码方便测试
    success(res, { code: result.code || null }, '验证码发送成功');
  } catch (err) {
    serverError(res, err, '发送验证码失败');
  }
}

/**
 * 登录/注册
 * @param {Object} req - Express请求对象
 * @param {Object} res - Express响应对象
 */
async function login(req, res) {
  try {
    const { phone, code } = req.body;

    // 验证手机号格式
    if (!/^1[3-9]\d{9}$/.test(phone)) {
      return error(res, 400, '手机号格式错误');
    }

    // 验证验证码
    const isValid = await smsService.verifyCode(phone, code);
    if (!isValid) {
      return error(res, 400, '验证码错误');
    }

    // 查找用户
    let user = await User.findByPhone(phone);

    // 如果用户不存在，先进行反欺诈检测再创建
    if (!user) {
      // 反欺诈：检查注册行为风险
      const clientIp = req.ip || req.connection.remoteAddress;
      const riskCheck = await antifraudService.checkRegistration(clientIp, phone);
      if (riskCheck.blocked) {
        console.warn(`注册被反欺诈拦截: IP=${clientIp}, 手机=${phone}, 风险分数=${riskCheck.risk_score}, 原因=${riskCheck.reasons.join(', ')}`);
        return error(res, 403, '注册受限，请联系客服');
      }

      user = await User.create({
        phone,
        nickname: `用户${phone.slice(-4)}`,
        avatar: null,
        gender: null,
        age: null,
        height: null,
        occupation: null,
        location: null,
        lat: null,
        lng: null,
        bio: null
      });
    }

    // 检查用户是否被禁用
    if (user.status === 0) {
      return error(res, 403, '账号已被禁用，请联系客服');
    }

    // 生成JWT token
    const token = jwt.sign(
      { id: user.id, phone: user.phone, role: user.role || 'user' },
      process.env.JWT_SECRET || 'your_jwt_secret_key',
      { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
    );

    success(res, {
      token,
      user: {
        id: user.id,
        phone: user.phone,
        nickname: user.nickname,
        avatar: user.avatar,
        gender: user.gender,
        age: user.age,
        height: user.height,
        occupation: user.occupation,
        location: user.location,
        bio: user.bio,
        is_vip: user.is_vip,
        vip_expire_time: user.vip_expire_time,
        role: user.role || 'user'
      }
    }, '登录成功');
  } catch (err) {
    serverError(res, err, '登录失败');
  }
}

module.exports = {
  sendCode,
  login
};
