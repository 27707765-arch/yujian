/**
 * 亲密关系服务
 * 集中管理亲密度的增加和等级计算
 */
const Intimacy = require('../models/Intimacy');
const Anniversary = require('../models/Anniversary');
const IntimacyBadge = require('../models/IntimacyBadge');

/**
 * 根据分数计算等级
 */
function getLevel(score) {
  if (score >= 1000) return 4;
  if (score >= 600) return 3;
  if (score >= 300) return 2;
  if (score >= 100) return 1;
  return 0;
}

/**
 * 等级名称
 */
function getLevelName(level) {
  return ['初识', '心动', '暧昧', '恋人', '挚爱'][level] || '初识';
}

/**
 * 匹配时初始化亲密关系
 */
async function onMatch(user1Id, user2Id) {
  try {
    const intimacy = await Intimacy.getOrCreate(user1Id, user2Id);
    await Anniversary.record(user1Id, user2Id, 'match', new Date());
    return intimacy;
  } catch (e) { /* 静默失败 */ }
}

/**
 * 聊天消息：+1分
 */
async function onChatMessage(senderId, receiverId) {
  try {
    const intimacy = await Intimacy.getOrCreate(senderId, receiverId);
    const today = new Date().toISOString().slice(0, 10);
    const lastDate = intimacy.last_interaction_at
      ? new Date(intimacy.last_interaction_at).toISOString().slice(0, 10)
      : null;

    let scoreChange = 1; // 每条消息 +1
    let actionType = 'chat';

    // 每日首次互动 +5
    if (lastDate !== today) {
      scoreChange += 5;
      actionType = 'daily_first';
      // 检查连续天数
      const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      if (lastDate === yesterday) {
        const newConsecutive = (intimacy.consecutive_days || 0) + 1;
        if (newConsecutive === 7) scoreChange += 20;
        if (newConsecutive === 30) scoreChange += 50;
        await Intimacy.updateConsecutive(intimacy.id, newConsecutive);
      } else {
        await Intimacy.updateConsecutive(intimacy.id, 1);
      }
    }

    const result = await Intimacy.addScore(
      intimacy.id, senderId, actionType, scoreChange,
      `聊天消息 +${scoreChange}`, intimacy.total_chat_count + 1
    );

    // 检查等级升级
    if (result && result.leveledUp) {
      await Anniversary.record(senderId, receiverId, `level_up_${result.newLevel}`, new Date());
    }

    return result;
  } catch (e) { /* 静默失败 */ }
}

/**
 * 通话结束：语音+2/分钟，视频+3/分钟
 */
async function onCallEnd(callerId, calleeId, callType, durationSeconds) {
  try {
    const intimacy = await Intimacy.getOrCreate(callerId, calleeId);
    const minutes = Math.floor(durationSeconds / 60);
    if (minutes <= 0) return;
    const perMinute = callType === 'video' ? 3 : 2;
    const scoreChange = minutes * perMinute;
    const result = await Intimacy.addScore(
      intimacy.id, callerId,
      callType === 'video' ? 'video_call' : 'voice_call',
      scoreChange,
      `${callType === 'video' ? '视频' : '语音'}通话 ${minutes}分钟 +${scoreChange}`,
      null,
      intimacy.total_call_duration + durationSeconds
    );
    if (result && result.leveledUp) {
      await Anniversary.record(callerId, calleeId, `level_up_${result.newLevel}`, new Date());
    }
    return result;
  } catch (e) { /* 静默失败 */ }
}

/**
 * 送礼：根据价格 +1~+10
 */
async function onGiftReceived(senderId, receiverId, giftPrice) {
  try {
    const intimacy = await Intimacy.getOrCreate(senderId, receiverId);
    let scoreChange = 1;
    if (giftPrice >= 500) scoreChange = 10;
    else if (giftPrice >= 100) scoreChange = 8;
    else if (giftPrice >= 50) scoreChange = 5;
    else if (giftPrice >= 10) scoreChange = 3;
    const result = await Intimacy.addScore(
      intimacy.id, senderId, 'gift',
      scoreChange, `送礼 +${scoreChange}`,
      null, intimacy.total_gift_value + giftPrice
    );
    if (result && result.leveledUp) {
      await Anniversary.record(senderId, receiverId, `level_up_${result.newLevel}`, new Date());
    }
    return result;
  } catch (e) { /* 静默失败 */ }
}

module.exports = {
  getLevel, getLevelName,
  onMatch, onChatMessage, onCallEnd, onGiftReceived
};
