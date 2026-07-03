/**
 * 订单控制器
 * 处理VIP购买和金币充值相关的HTTP请求
 */

const { pool } = require('../config/database');
const User = require('../models/User');
const Wallet = require('../models/Wallet');
const { success, error, serverError } = require('../utils/response');

// 金币充值套餐ID（对应 vip_packages 中的"金币充值"记录）
const COIN_PACKAGE_ID = 4;

/**
 * 是否处于支付模拟模式
 * 当 SIMULATE_PAYMENT=true 或 NODE_ENV 为 development/test 时，自动确认支付
 * 内测期间设置 SIMULATE_PAYMENT=true 即可跳过真实支付对接
 */
function isSimulateMode() {
  return process.env.SIMULATE_PAYMENT === 'true'
    || process.env.NODE_ENV === 'development'
    || process.env.NODE_ENV === 'test';
}

/**
 * 生成订单号
 * @returns {string} - 唯一订单号
 */
function generateOrderNo() {
  return 'YU' + Date.now() + Math.random().toString(36).slice(2, 8).toUpperCase();
}

/**
 * 创建VIP订单
 * @param {Object} req - Express请求对象
 * @param {Object} res - Express响应对象
 */
async function createVipOrder(req, res) {
  try {
    const { id } = req.user;
    const { package_id } = req.body;

    if (!package_id) return error(res, 400, '请选择套餐');

    // 查询套餐
    const [packages] = await pool.execute('SELECT * FROM vip_packages WHERE id = ?', [package_id]);
    if (packages.length === 0) return error(res, 404, '套餐不存在');

    const pkg = packages[0];
    if (!pkg || !pkg.price || !pkg.duration) {
      return error(res, 400, '套餐数据异常，请重新选择');
    }

    // 金币充值套餐不能通过VIP接口购买
    if (package_id === COIN_PACKAGE_ID) {
      return error(res, 400, '请使用充值接口购买金币');
    }

    const orderNo = generateOrderNo();

    await pool.execute(
      'INSERT INTO orders (user_id, package_id, order_no, amount, status) VALUES (?, ?, ?, ?, 0)',
      [id, package_id, orderNo, pkg.price]
    );

    // 支付模拟模式：自动确认支付；生产模式：需对接真实支付网关
    if (isSimulateMode()) {
      console.warn('⚠️  支付模拟模式：自动确认支付，生产环境需对接支付网关');
      await pool.execute('UPDATE orders SET status = 1 WHERE order_no = ?', [orderNo]);

      // 计算VIP过期时间
      const expireTime = new Date(Date.now() + pkg.duration * 86400000);
      await User.updateVipStatus(id, true, expireTime);

      success(res, { order_no: orderNo, amount: pkg.price, expire_time: expireTime, payment_required: false }, '开通成功（模拟支付）');
    } else {
      // 真实支付模式：返回订单信息，需完成支付后才能开通VIP
      success(res, {
        order_no: orderNo,
        amount: pkg.price,
        payment_required: true,
        message: '订单已创建，请完成支付'
      }, '订单已创建');
    }
  } catch (err) {
    serverError(res, err, '开通VIP失败');
  }
}

/**
 * 创建充值订单（金币充值）
 * @param {Object} req - Express请求对象
 * @param {Object} res - Express响应对象
 */
async function createRechargeOrder(req, res) {
  try {
    const { id } = req.user;
    const { amount } = req.body;

    // 严格校验：金额必须为有效正数，防止 NaN/字符串/负数/零通过
    const numAmount = Number(amount);
    if (isNaN(numAmount) || numAmount <= 0 || !isFinite(numAmount)) {
      return error(res, 400, '请选择有效的充值金额');
    }

    const orderNo = generateOrderNo();

    // 支付模拟模式：自动完成充值；生产模式：需对接真实支付网关
    if (isSimulateMode()) {
      console.warn('⚠️  支付模拟模式：自动完成充值');

      // 持久化订单记录
      try {
        await pool.execute(
          'INSERT INTO orders (user_id, package_id, order_no, amount, status) VALUES (?, ?, ?, ?, 1)',
          [id, COIN_PACKAGE_ID, orderNo, numAmount]
        );
      } catch (dbErr) {
        console.error('订单持久化失败:', dbErr.message);
        return error(res, 500, '系统繁忙，请稍后重试');
      }

      // 实际充值到钱包（1元 = 100金币）
      const coins = numAmount * 100;
      await Wallet.recharge(id, coins, 'order', null);

      const wallet = await Wallet.getOrCreate(id);
      success(res, { order_no: orderNo, amount: numAmount, coins, balance: wallet.balance }, '充值成功（模拟支付）');
    } else {
      // 真实支付模式：返回订单信息，需完成支付后才能到账
      await pool.execute(
        'INSERT INTO orders (user_id, package_id, order_no, amount, status) VALUES (?, ?, ?, ?, 0)',
        [id, COIN_PACKAGE_ID, orderNo, numAmount]
      );
      success(res, {
        order_no: orderNo,
        amount: numAmount,
        coins: numAmount * 100,
        payment_required: true,
        message: '订单已创建，请完成支付'
      }, '订单已创建');
    }
  } catch (err) {
    serverError(res, err, '充值失败');
  }
}

/**
 * 获取订单列表
 * @param {Object} req - Express请求对象
 * @param {Object} res - Express响应对象
 */
async function getOrders(req, res) {
  try {
    const { id } = req.user;
    const { limit = 20, offset = 0 } = req.query;
    const [orders] = await pool.execute(
      'SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?',
      [id, parseInt(limit), parseInt(offset)]
    );
    success(res, orders);
  } catch (err) {
    serverError(res, err, '获取订单失败');
  }
}

module.exports = { createVipOrder, createRechargeOrder, getOrders };
