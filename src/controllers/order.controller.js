/**
 * 订单控制器
 * 处理VIP购买和金币充值相关的HTTP请求
 * S23：订单创建/到账统一走 pay.gateway（simulate 自动到账；wechat/alipay 预留）
 */

const { pool } = require('../config/database');
const payGateway = require('../services/pay.gateway');
const { success, error, serverError } = require('../utils/response');

// 金币充值套餐ID（对应 vip_packages 中的"金币充值"记录）
const COIN_PACKAGE_ID = payGateway.COIN_PACKAGE_ID;

/**
 * 创建VIP订单
 * @param {Object} req - Express请求对象
 * @param {Object} res - Express响应对象
 */
async function createVipOrder(req, res) {
  try {
    const { id } = req.user;
    const { package_id, provider } = req.body;

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

    const result = await payGateway.createOrder({
      user_id: id, order_type: 'vip', provider, package_id, amount: Number(pkg.price)
    });

    success(res, result, result.payment_required ? '订单已创建' : '开通成功（模拟支付）');
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
    const { amount, provider } = req.body;

    // 严格校验：金额必须为有效正数，防止 NaN/字符串/负数/零通过
    const numAmount = Number(amount);
    if (isNaN(numAmount) || numAmount <= 0 || !isFinite(numAmount)) {
      return error(res, 400, '请选择有效的充值金额');
    }

    const result = await payGateway.createOrder({
      user_id: id, order_type: 'recharge', provider, amount: numAmount
    });

    success(res, result, result.payment_required ? '订单已创建' : '充值成功（模拟支付）');
  } catch (err) {
    serverError(res, err, '充值失败');
  }
}

/**
 * 支付平台回调（验签后到账）
 * 注意：本路由不挂 authMiddleware（支付平台回调用验签而非 Bearer Token）
 * @param {Object} req - Express请求对象（req.params.provider = simulate|wechat|alipay）
 * @param {Object} res - Express响应对象
 */
async function handleNotify(req, res) {
  try {
    const { provider } = req.params;
    const { valid, order, reason } = await payGateway.verifyNotify(provider, req.body);

    if (!valid) {
      return error(res, 400, reason || '验签失败');
    }

    // 幂等到账（orders.status 已为 1 时直接返回）
    const { already_paid, credited } = await payGateway.completeOrder(order);

    success(res, {
      order_no: order.order_no,
      already_paid,
      credited: credited && !credited.error ? credited.type : null
    }, already_paid ? '订单已处理' : '支付确认成功');
  } catch (err) {
    serverError(res, err, '支付回调处理失败');
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

module.exports = { createVipOrder, createRechargeOrder, handleNotify, getOrders };
