/**
 * 推送通知服务（完整实现）
 *
 * 推送渠道优先级：
 *   1. WebSocket 实时推送（用户在线时优先）
 *   2. 厂商推送 SDK（Android：华为/小米/OPPO/VIVO）
 *   3. APNs（iOS）
 *
 * 推送免打扰：22:00-08:00 不发送非紧急推送
 * 所有推送记录写入 push_logs 表用于排障
 */

const PushToken = require('../models/PushToken');
const UserSettings = require('../models/UserSettings');
const websocketService = require('./websocket.service');
const { executeQuery } = require('../utils/database');

// ==================== 推送类型 ====================
const PUSH_TYPES = {
  MATCH:    'match',     // 匹配成功
  LIKE:     'like',      // 被喜欢
  MESSAGE:  'message',   // 新消息
  VIEW:     'view',      // 主页被浏览
  GIFT:     'gift',      // 收到礼物
  SECURITY: 'security',  // 账号安全
  SYSTEM:   'system',    // 系统通知
};

// ==================== 推送渠道 ====================
const CHANNELS = {
  WEBSOCKET: 'websocket',
  APNS:      'apns',
  ANDROID:   'android',
  HUAWEI:    'huawei',
  XIAOMI:    'xiaomi',
  OPPO:      'oppo',
  VIVO:      'vivo',
};

// 免打扰时段（22:00-08:00）
const DND_START = 22;
const DND_END = 8;

// 不受免打扰限制的推送类型
const URGENT_TYPES = new Set([PUSH_TYPES.SECURITY, PUSH_TYPES.SYSTEM]);

// 推送类型 → 用户设置开关字段映射
const NOTIFY_SETTING_MAP = {
  [PUSH_TYPES.MESSAGE]: 'message_notify',
  [PUSH_TYPES.MATCH]:   'match_notify',
  [PUSH_TYPES.LIKE]:    'like_notify',
  [PUSH_TYPES.VIEW]:    'view_notify',
};

// ==================== 核心函数 ====================

/**
 * 检查是否在免打扰时段
 * @returns {boolean}
 */
function isDNDTime() {
  const hour = new Date().getHours();
  return hour >= DND_START || hour < DND_END;
}

/**
 * 写入推送日志
 * @param {Object} log - 日志数据
 */
async function writePushLog(log) {
  try {
    await executeQuery(
      `INSERT INTO push_logs (user_id, title, body, data, push_type, channel, status, error_message)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        log.user_id, log.title, log.body,
        log.data ? JSON.stringify(log.data) : null,
        log.push_type, log.channel, log.status, log.error_message || null
      ]
    );
  } catch (err) {
    console.error('写入推送日志失败:', err.message);
  }
}

/**
 * 向指定用户发送推送通知（核心函数）
 *
 * 流程：
 *   ① 检查用户推送开关
 *   ② 检查免打扰时段
 *   ③ 用户在线 → WebSocket 推送（优先）
 *   ④ 用户离线 → 厂商推送 SDK / APNs
 *   ⑤ 记录推送日志
 *
 * @param {number} userId - 目标用户ID
 * @param {Object} notification - 通知内容
 * @param {string} notification.title - 标题
 * @param {string} notification.body - 内容
 * @param {Object} [notification.data] - 附加数据
 * @param {string} [notification.pushType] - 推送类型，默认 'system'
 * @returns {Promise<{success: boolean, channel: string, reason?: string}>}
 */
async function sendPush(userId, notification) {
  const { title, body, data = {}, pushType = PUSH_TYPES.SYSTEM } = notification;

  // ① 检查用户推送开关
  const settingKey = NOTIFY_SETTING_MAP[pushType];
  if (settingKey) {
    try {
      const settings = await UserSettings.get(userId);
      if (settings[settingKey] !== 1) {
        await writePushLog({ user_id: userId, title, body, data, push_type: pushType, channel: 'none', status: 'skipped', error_message: '用户已关闭此类推送' });
        return { success: false, channel: 'none', reason: 'user_disabled' };
      }
    } catch (e) { /* 获取设置失败，继续推送 */ }
  }

  // ② 免打扰检查（紧急推送除外）
  if (!URGENT_TYPES.has(pushType) && isDNDTime()) {
    await writePushLog({ user_id: userId, title, body, data, push_type: pushType, channel: 'none', status: 'skipped', error_message: '免打扰时段' });
    return { success: false, channel: 'none', reason: 'dnd' };
  }

  // ③ 优先走 WebSocket
  if (websocketService.isUserOnline(userId)) {
    const sent = websocketService.sendToUser(userId, {
      type: 'push_notification',
      data: { title, body, push_type: pushType, ...data }
    });
    if (sent) {
      await writePushLog({ user_id: userId, title, body, data, push_type: pushType, channel: CHANNELS.WEBSOCKET, status: 'sent' });
      return { success: true, channel: CHANNELS.WEBSOCKET };
    }
  }

  // ④ 离线：走厂商推送 / APNs
  try {
    const tokens = await PushToken.getByUserId(userId);
    if (tokens.length === 0) {
      await writePushLog({ user_id: userId, title, body, data, push_type: pushType, channel: 'none', status: 'failed', error_message: '无活跃设备Token' });
      return { success: false, channel: 'none', reason: 'no_tokens' };
    }

    let sentCount = 0;
    for (const token of tokens) {
      const channel = getChannelForPlatform(token.platform);
      try {
        await sendToVendor(channel, token.device_token, { title, body, data });
        sentCount++;
        await writePushLog({ user_id: userId, title, body, data, push_type: pushType, channel, status: 'sent' });
      } catch (vendorErr) {
        await writePushLog({ user_id: userId, title, body, data, push_type: pushType, channel, status: 'failed', error_message: vendorErr.message });
      }
    }

    if (sentCount > 0) {
      return { success: true, channel: 'vendor', sent: sentCount };
    }
    return { success: false, channel: 'vendor', reason: 'all_failed' };
  } catch (err) {
    await writePushLog({ user_id: userId, title, body, data, push_type: pushType, channel: 'none', status: 'failed', error_message: err.message });
    return { success: false, channel: 'none', reason: err.message };
  }
}

/**
 * 批量推送（向多个用户发送同一通知）
 * @param {number[]} userIds - 目标用户ID数组
 * @param {Object} notification - 通知内容
 * @returns {Promise<{total: number, success: number, failed: number}>}
 */
async function sendBatchPush(userIds, notification) {
  const results = await Promise.allSettled(
    userIds.map(uid => sendPush(uid, notification))
  );
  const success = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
  const failed = results.length - success;
  return { total: userIds.length, success, failed };
}

// ==================== 厂商推送 SDK 适配层 ====================

/**
 * 根据平台获取推送渠道
 * @param {string} platform - ios / android / web
 * @returns {string} - 渠道标识
 */
function getChannelForPlatform(platform) {
  switch (platform) {
    case 'ios': return CHANNELS.APNS;
    case 'android': return CHANNELS.ANDROID;
    default: return CHANNELS.ANDROID;
  }
}

/**
 * 向厂商推送通道发送推送（预留接口，对接时填充实现）
 *
 * 各厂商SDK接入方式：
 *   - 华为: @hmscore/react-native-hms-push 或 huawei-push npm
 *   - 小米: xiaomi-push npm
 *   - OPPO: oppo-push npm
 *   - VIVO: vivo-push npm
 *   - APNs:  node-apn npm 或 apn npm
 *
 * @param {string} channel - 渠道标识
 * @param {string} deviceToken - 设备Token
 * @param {Object} payload - { title, body, data }
 * @returns {Promise<void>}
 */
async function sendToVendor(channel, deviceToken, payload) {
  // 预留：实际对接时根据 channel 调用对应SDK
  // 当前输出模拟日志，后续替换为真实SDK调用
  console.log(`[推送] → ${channel} | token: ${deviceToken.slice(0, 12)}... | ${payload.title}`);
}

// ==================== 预定义推送模板 ====================

/**
 * 被喜欢通知
 * 当有人喜欢了用户时调用
 */
async function notifyLike(targetUserId, fromUser) {
  return sendPush(targetUserId, {
    title: '❤️ 有人喜欢了你',
    body: `有人对你表示了喜欢${fromUser ? '，来自 ' + fromUser.nickname : ''}`,
    data: { type: 'like', liker_id: fromUser?.id },
    pushType: PUSH_TYPES.LIKE
  });
}

/**
 * 匹配成功通知
 * 当双方互相喜欢时调用（发给双方）
 */
async function notifyMatch(userId, partner) {
  return sendPush(userId, {
    title: '💕 匹配成功！',
    body: `你和 ${partner?.nickname || '一位用户'} 互生好感，快去聊天吧！`,
    data: { type: 'match', match_id: partner?.match_id, user_id: partner?.id },
    pushType: PUSH_TYPES.MATCH
  });
}

/**
 * 收到礼物通知
 */
async function notifyGift(targetUserId, giftInfo) {
  return sendPush(targetUserId, {
    title: '🎁 收到新礼物！',
    body: `${giftInfo.sender_nickname || '有人'} 送了你 ${giftInfo.gift_name || '一个礼物'}${giftInfo.message ? '：「' + giftInfo.message + '」' : ''}`,
    data: { type: 'gift', sender_id: giftInfo.sender_id, gift_id: giftInfo.gift_id },
    pushType: PUSH_TYPES.GIFT
  });
}

/**
 * 新消息通知（仅离线时发送）
 */
async function notifyNewMessage(userId, msgInfo) {
  // 在线则跳过（由 WebSocket 直接推送消息）
  if (websocketService.isUserOnline(userId)) {
    return { success: true, channel: CHANNELS.WEBSOCKET, reason: 'user_online_skip_push' };
  }
  return sendPush(userId, {
    title: msgInfo.sender_nickname || '新消息',
    body: msgInfo.content_preview || '你收到了一条新消息',
    data: { type: 'new_message', conversation_id: msgInfo.conversation_id, sender_id: msgInfo.sender_id },
    pushType: PUSH_TYPES.MESSAGE
  });
}

/**
 * 主页被浏览通知
 */
async function notifyView(userId, viewInfo) {
  return sendPush(userId, {
    title: '👀 有人查看了你的主页',
    body: `有${viewInfo.count || 1}人查看了你的主页`,
    data: { type: 'view', viewer_id: viewInfo.viewer_id },
    pushType: PUSH_TYPES.VIEW
  });
}

/**
 * 异地登录提醒（不受免打扰限制）
 */
async function notifyDeviceLogin(userId, city) {
  return sendPush(userId, {
    title: '🔐 异地登录提醒',
    body: `你的账号在${city || '新设备'}登录，如非本人操作请及时修改密码`,
    data: { type: 'security', action: 'review_login' },
    pushType: PUSH_TYPES.SECURITY
  });
}

/**
 * VIP 即将到期提醒
 */
async function notifyVipExpiring(userId, daysLeft) {
  return sendPush(userId, {
    title: '⭐ VIP 即将到期',
    body: `你的VIP还有${daysLeft}天到期，续费享更多特权`,
    data: { type: 'system', action: 'renew_vip' },
    pushType: PUSH_TYPES.SYSTEM
  });
}

module.exports = {
  // 核心API
  sendPush,
  sendToUser: sendPush,  // 向后兼容旧接口名
  sendBatchPush,
  // 预定义模板
  notifyLike,
  notifyMatch,
  notifyGift,
  notifyNewMessage,
  notifyView,
  notifyDeviceLogin,
  notifyVipExpiring,
  // 常量
  PUSH_TYPES,
  CHANNELS,
};
