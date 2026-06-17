/**
 * 钱包控制器
 * 处理钱包余额查询、交易流水和消费统计
 */

const Wallet = require('../models/Wallet');
const { success, error, serverError } = require('../utils/response');

/**
 * 获取钱包信息（余额+统计）
 */
async function getWallet(req, res) {
  try {
    const { id } = req.user;
    const stats = await Wallet.getStats(id);
    success(res, stats, '获取成功');
  } catch (err) {
    serverError(res, err, '获取钱包信息失败');
  }
}

/**
 * 获取交易流水
 */
async function getTransactions(req, res) {
  try {
    const { id } = req.user;
    const { limit = 20, offset = 0, type } = req.query;

    let transactions = await Wallet.getTransactions(id, parseInt(limit), parseInt(offset));

    // 按类型筛选
    if (type && ['recharge', 'gift_send', 'gift_receive'].includes(type)) {
      transactions = transactions.filter(t => t.type === type);
    }

    success(res, transactions);
  } catch (err) {
    serverError(res, err, '获取交易流水失败');
  }
}

/**
 * 获取消费统计
 */
async function getConsumptionStats(req, res) {
  try {
    const { id } = req.user;
    const wallet = await Wallet.getOrCreate(id);
    const transactions = await Wallet.getTransactions(id, 1000, 0);

    // 按日统计消费（从流水明细计算）
    const dailyStats = {};
    const monthlyStats = {};

    transactions.forEach(t => {
      const date = new Date(t.created_at).toISOString().slice(0, 10);
      const month = date.slice(0, 7);

      if (!dailyStats[date]) dailyStats[date] = { recharge: 0, spent: 0, earned: 0 };
      if (!monthlyStats[month]) monthlyStats[month] = { recharge: 0, spent: 0, earned: 0 };

      if (t.type === 'recharge') {
        dailyStats[date].recharge += t.amount;
        monthlyStats[month].recharge += t.amount;
      } else if (t.type === 'gift_send') {
        dailyStats[date].spent += Math.abs(t.amount);
        monthlyStats[month].spent += Math.abs(t.amount);
      } else if (t.type === 'gift_receive' || t.type === 'checkin' || t.type === 'task_reward') {
        dailyStats[date].earned += t.amount;
        monthlyStats[month].earned += t.amount;
      }
    });

    // 使用 wallet 表预计算字段作为汇总（与流水明细保持一致）
    success(res, {
      balance: wallet.balance,
      total_recharge: wallet.total_recharge,
      total_spent: wallet.total_spent || 0,
      total_earned: wallet.total_earned || 0,
      daily: dailyStats,
      monthly: monthlyStats
    });
  } catch (err) {
    serverError(res, err, '获取消费统计失败');
  }
}

module.exports = { getWallet, getTransactions, getConsumptionStats };
