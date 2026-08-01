/**
 * 支付网关（预留，不接真实 SDK）
 *
 * 三个 provider：
 *   - simulate：模拟支付（SIMULATE_PAYMENT=true 或 development/test 环境），下单即自动到账
 *   - wechat / alipay：预留真实支付，createOrder 返回 payment_required=true（待对接），verifyNotify 拒绝
 *
 * 统一能力：
 *   - createOrder(query)  创建订单（simulate 下自动确认 + 到账；真实 provider 仅落 status=0 订单）
 *   - verifyNotify(provider, payload)  校验支付平台回调
 *   - completeOrder(order) 幂等到账（VIP 开通 / 金币充值），被 simulate 下单与回调共用
 */

const { pool } = require('../config/database');
const User = require('../models/User');
const Wallet = require('../models/Wallet');

// 金币充值套餐ID（对应 vip_packages 中的"金币充值"记录）
const COIN_PACKAGE_ID = 4;

/**
 * 是否处于支付模拟模式
 * 当 SIMULATE_PAYMENT=true 或 NODE_ENV 为 development/test 时，自动确认支付
 */
function isSimulateMode() {
  return process.env.SIMULATE_PAYMENT === 'true'
    || process.env.NODE_ENV === 'development'
    || process.env.NODE_ENV === 'test';
}

/**
 * 生成订单号
 */
function generateOrderNo() {
  return 'YU' + Date.now() + Math.random().toString(36).slice(2, 8).toUpperCase();
}

/**
 * 幂等到账：更新订单为已支付并发放权益（VIP/金币）
 * 重复回调安全：orders.status 已为 1 时直接返回，避免重复充值。
 * @param {Object} order - orders 行：{ id, order_no, user_id, package_id, amount }
 * @returns {Promise<Object>} { already_paid, credited }
 */
async function completeOrder(order) {
  // 幂等：已支付直接返回
  const [[rows]] = await pool.query('SELECT status FROM orders WHERE id = ?', [order.id]);
  if (!rows || rows.status === 1) {
    return { already_paid: true, credited: false };
  }

  await pool.query('UPDATE orders SET status = 1 WHERE id = ?', [order.id]);

  const credited = order.package_id === COIN_PACKAGE_ID
    ? await creditCoins(order)
    : await creditVip(order);

  return { already_paid: false, credited };
}

/** 金币充值：1元 = 100金币 */
async function creditCoins(order) {
  const coins = Math.round(Number(order.amount) * 100);
  await Wallet.recharge(order.user_id, coins, 'order', null);
  return { type: 'coins', coins, amount: order.amount };
}

/** VIP 开通：按套餐时长续期 */
async function creditVip(order) {
  const [packages] = await pool.query('SELECT * FROM vip_packages WHERE id = ?', [order.package_id]);
  const pkg = packages[0];
  if (!pkg || !pkg.duration) return { type: 'vip', error: '套餐数据异常' };
  const expireTime = new Date(Date.now() + pkg.duration * 86400000);
  await User.updateVipStatus(order.user_id, true, expireTime);
  return { type: 'vip', expire_time: expireTime, duration_days: pkg.duration };
}

/**
 * 创建订单
 * @param {Object} query
 *   - user_id      用户ID
 *   - order_type   'vip' | 'recharge'
 *   - provider     'simulate' | 'wechat' | 'alipay'（默认 simulate）
 *   - package_id   套餐ID（vip 必填）
 *   - amount       金额（recharge 必填）
 * @returns {Promise<Object>}
 *   - simulate: { order_no, amount, payment_required:false, ...credits, provider:'simulate' }
 *   - wechat/alipay: { order_no, amount, payment_required:true, provider }
 */
async function createOrder(query) {
  const { user_id, order_type, provider = 'simulate', package_id, amount } = query;
  const orderNo = generateOrderNo();
  const useSimulate = provider === 'simulate' && isSimulateMode();

  // 统一落订单（simulate 先落 status=0，随后幂等到账；真实 provider 保持待支付）
  const [result] = await pool.query(
    'INSERT INTO orders (user_id, package_id, order_no, amount, status) VALUES (?, ?, ?, ?, 0)',
    [user_id, package_id || (order_type === 'recharge' ? COIN_PACKAGE_ID : null), orderNo, amount || 0]
  );
  const order = { id: result.insertId, order_no: orderNo, user_id, package_id: package_id || COIN_PACKAGE_ID, amount: amount || 0 };

  if (useSimulate) {
    console.warn('⚠️  支付模拟模式：自动确认支付，生产环境需对接支付网关');
    const { credited } = await completeOrder(order);
    return {
      order_no: orderNo,
      amount: order.amount,
      payment_required: false,
      provider,
      simulate: true,
      ...(credited && credited.type === 'coins' ? { coins: credited.coins, balance: (await Wallet.getOrCreate(user_id)).balance } : {}),
      ...(credited && credited.type === 'vip' ? { expire_time: credited.expire_time } : {})
    };
  }

  return {
    order_no: orderNo,
    amount: order.amount,
    payment_required: true,
    provider,
    simulate: false,
    message: '订单已创建，请完成支付'
  };
}

/**
 * 校验支付回调
 * @param {string} provider - simulate | wechat | alipay
 * @param {Object} payload - 回调参数
 *   - simulate: { order_no, amount }
 * @returns {Promise<{valid:boolean, order?:Object, reason?:string}>}
 */
async function verifyNotify(provider, payload) {
  if (provider === 'simulate') {
    const { order_no, amount } = payload || {};
    if (!order_no) return { valid: false, reason: '缺少订单号' };
    const [rows] = await pool.query('SELECT * FROM orders WHERE order_no = ?', [order_no]);
    if (!rows[0]) return { valid: false, reason: '订单不存在' };
    const order = rows[0];
    if (amount !== undefined && Number(amount) !== Number(order.amount)) {
      return { valid: false, reason: '金额不匹配' };
    }
    return { valid: true, order };
  }
  // wechat / alipay：真实 SDK 未接入，拒绝
  return { valid: false, reason: 'provider 未接入真实支付 SDK' };
}

module.exports = {
  createOrder,
  verifyNotify,
  completeOrder,
  isSimulateMode,
  generateOrderNo,
  COIN_PACKAGE_ID,
};
