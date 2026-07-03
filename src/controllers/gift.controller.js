/**
 * 礼物控制器
 * 处理礼物目录查询和赠送
 */

const Gift = require('../models/Gift');
const Wallet = require('../models/Wallet');
const Checkin = require('../models/Checkin');
const { success, error, serverError } = require('../utils/response');
const websocketService = require('../services/websocket.service');

/**
 * 获取礼物列表
 */
async function getGiftList(req, res) {
  try {
    const gifts = await Gift.getAll();
    success(res, gifts);
  } catch (err) {
    serverError(res, err, '获取礼物列表失败');
  }
}

/**
 * 赠送礼物
 * Gift.send() 内部已集成：扣款 + 创建记录 + 接收者分成，一站式处理
 */
async function sendGift(req, res) {
  try {
    const { id } = req.user;
    const { receiver_id, gift_id, quantity = 1, message, conversation_id } = req.body;

    if (!receiver_id || !gift_id) {
      return error(res, 400, '接收者ID和礼物ID不能为空');
    }

    if (id === parseInt(receiver_id)) {
      return error(res, 400, '不能给自己送礼物');
    }

    // Gift.send() 内部已包含扣款+记录+分成，调用方无需重复操作
    const record = await Gift.send(
      id, parseInt(receiver_id), parseInt(gift_id),
      parseInt(quantity), message,
      conversation_id ? parseInt(conversation_id) : null
    );

    // 获取最新余额用于返回和推送
    const balanceRemaining = await Wallet.getBalance(id);

    // WebSocket 推送礼物通知（record 已包含 gift_name/gift_image/gift_animation）
    websocketService.sendToUser(parseInt(receiver_id), {
      type: 'gift_received',
      data: {
        sender_id: id,
        gift_name: record.gift_name,
        gift_image: record.gift_image,
        animation_type: record.gift_animation,
        quantity: parseInt(quantity),
        total_price: record.total_price,
        message: message || '',
        balance: balanceRemaining
      }
    });

    // 触发每日任务：赠送礼物
    Checkin.updateTaskProgress(id, 'send_gift').catch(() => {});

    success(res, {
      record_id: record.id,
      gift_name: record.gift_name,
      total_price: record.total_price,
      balance_remaining: balanceRemaining
    }, '礼物赠送成功');
  } catch (err) {
    // 区分业务错误（余额不足等400）和系统错误（500）
    if (err.message === '金币不足，请充值' || err.message === '礼物不存在' || err.message === '礼物已下架') {
      return error(res, 400, err.message);
    }
    serverError(res, err, '赠送礼物失败');
  }
}

/**
 * 获取收到的礼物列表
 */
async function getReceivedGifts(req, res) {
  try {
    const { id } = req.user;
    const { limit = 20, offset = 0 } = req.query;
    const gifts = await Gift.getReceivedGifts(id, parseInt(limit), parseInt(offset));
    success(res, gifts);
  } catch (err) {
    serverError(res, err, '获取礼物记录失败');
  }
}

/**
 * 获取送出的礼物列表
 */
async function getSentGifts(req, res) {
  try {
    const { id } = req.user;
    const { limit = 20, offset = 0 } = req.query;
    const gifts = await Gift.getSentGifts(id, parseInt(limit), parseInt(offset));
    success(res, gifts);
  } catch (err) {
    serverError(res, err, '获取礼物记录失败');
  }
}

module.exports = { getGiftList, sendGift, getReceivedGifts, getSentGifts };
