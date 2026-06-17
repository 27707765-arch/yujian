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

    // 获取礼物信息
    const gift = await Gift.findById(parseInt(gift_id));
    if (!gift) return error(res, 404, '礼物不存在');

    const totalPrice = gift.price * parseInt(quantity);

    // 检查余额并扣款
    const spendResult = await Wallet.spend(id, totalPrice, 'gift_send', 'gift_record');
    if (!spendResult.success) {
      return error(res, 400, spendResult.message);
    }

    // 创建赠送记录
    const record = await Gift.send(id, parseInt(receiver_id), parseInt(gift_id), parseInt(quantity), message, conversation_id ? parseInt(conversation_id) : null);

    // 接收者收入分成（默认70%，可通过 GIFT_SHARE_RATIO 环境变量配置）
    const shareRatio = parseFloat(process.env.GIFT_SHARE_RATIO) || 0.7;
    const earnAmount = Math.floor(totalPrice * shareRatio);
    if (earnAmount > 0) {
      await Wallet.earn(parseInt(receiver_id), earnAmount, record.id);
    }

    // WebSocket 推送礼物通知
    websocketService.sendToUser(parseInt(receiver_id), {
      type: 'gift_received',
      data: {
        sender_id: id,
        gift_name: gift.name,
        gift_image: gift.image,
        animation_type: gift.animation_type,
        quantity: parseInt(quantity),
        total_price: totalPrice,
        message: message || '',
        balance: spendResult.balance
      }
    });

    // 触发每日任务：赠送礼物
    Checkin.updateTaskProgress(id, 'send_gift').catch(() => {});

    success(res, {
      record_id: record.id,
      gift_name: gift.name,
      total_price: totalPrice,
      balance_remaining: spendResult.balance
    }, '礼物赠送成功');
  } catch (err) {
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
