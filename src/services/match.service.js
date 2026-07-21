/**
 * 匹配服务
 * 用于处理用户推荐、喜欢和跳过等匹配相关操作
 * 包含用户推荐算法和匹配逻辑，集成拉黑过滤和隐私设置
 */

const { executeQuery } = require('../utils/database');
const User = require('../models/User');
const Like = require('../models/Like');
const Match = require('../models/Match');
const Skip = require('../models/Skip');
const Block = require('../models/Block');
const UserSettings = require('../models/UserSettings');
const View = require('../models/View');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const websocketService = require('./websocket.service');
const pushService = require('./push.service');
const MatchAlgorithm = require('./matchAlgorithm.service');

/**
 * 推荐用户
 * @param {number} user_id - 用户ID
 * @param {Object} filters - 筛选条件
 * @param {string} filters.scope - 查询模式：city=同城，nearby=附近
 * @param {number} filters.ageMin - 最小年龄
 * @param {number} filters.ageMax - 最大年龄
 * @param {number} filters.distance - 距离(km)
 * @param {number} filters.limit - 限制数量
 * @returns {Promise<Array>} - 推荐用户列表
 */
async function recommendUsers(user_id, filters = {}) {
  try {
    const currentUser = await User.findById(user_id);
    if (!currentUser) {
      throw new Error('用户不存在');
    }

    const { scope = 'city', ageMin = 18, ageMax = 35, distance = 20, limit = 20 } = filters;

    // 根据查询模式获取候选用户
    let users = [];
    if (scope === 'nearby' && currentUser.lat && currentUser.lng) {
      // 附近：按 20km 距离查（Bounding Box 预过滤）
      users = await User.getNearbyUsers(
        user_id,
        currentUser.lat,
        currentUser.lng,
        distance,
        limit * 3 // 多取一些，因为需要多层过滤
      );
    } else if (scope === 'city' && currentUser.city) {
      // 同城：按 city 字段查同市用户
      users = await User.getUsersByCity(
        user_id,
        currentUser.city,
        limit * 3
      );
    } else {
      // 降级：当前用户没有 city 也没有坐标时，取全部用户
      try {
        const result = await executeQuery(
          'SELECT * FROM users WHERE id != ? AND status = 1 LIMIT ?',
          [user_id, limit * 3]
        );
        users = Array.isArray(result) ? result : (result && result[0]) || [];
      } catch (fallbackErr) {
        users = [];
      }
    }

    // 年龄过滤
    const ageFiltered = users.filter(user => {
      if (user.age && (user.age < ageMin || user.age > ageMax)) {
        return false;
      }
      return true;
    });

    // 获取已跳过的用户 ID（30 天内）
    const skippedIds = await Skip.getSkippedUserIds(user_id);

    // 获取已拉黑/被拉黑的用户 ID
    const blockedIds = await Block.getBlockedUserIds(user_id);
    // 也排除拉黑了当前用户的人（双向）
    let blockedByOthers = [];
    try {
      const result = await executeQuery(
        'SELECT user_id FROM user_blocks WHERE blocked_user_id = ?',
        [user_id]
      );
      const rows = Array.isArray(result) ? result : (result && result[0]) || [];
      blockedByOthers = rows.map(r => r.user_id);
    } catch (err) {
      // 忽略错误，继续推荐
    }

    // 合并所有排除的ID
    const excludedIds = new Set([...skippedIds, ...blockedIds, ...blockedByOthers]);

    // ==================== 批量查询（消除 N+1 问题） ====================
    // 提取所有候选用户的 ID 列表
    const candidateIds = ageFiltered.map(u => u.id);
    let excludedSet = excludedIds; // 已包含 skippedIds + blockedIds + blockedByOthers

    // 一次性批量查询：已喜欢列表、已匹配列表、隐私设置
    const [likedSet, matchedSet, settingsMap] = await Promise.all([
      Like.batchExists(user_id, candidateIds),
      Match.batchExists(user_id, candidateIds),
      UserSettings.batchGet(candidateIds)
    ]);

    // 收集待记录的浏览，在循环外批量处理
    const viewPromises = [];

    // 循环内仅做内存判断，不再逐条查询数据库
    const recommendedUsers = [];
    for (const user of ageFiltered) {
      // 排除已跳过和拉黑相关
      if (excludedSet.has(user.id)) continue;

      // 内存判断：是否已喜欢（Set.has 查找 O(1)）
      if (likedSet.has(user.id)) continue;

      // 内存判断：是否已匹配
      if (matchedSet.has(user.id)) continue;

      // 用 Map 读取隐私设置，替换逐条查询
      const settings = settingsMap.get(user.id);
      let userForRecommend = { ...user };
      if (settings && settings.hide_distance) {
        userForRecommend._distance_hidden = true;
      }

      // 浏览记录异步写入（收集 Promise，不阻塞推荐返回）
      viewPromises.push(
        View.create(user_id, user.id).catch(err => {
          console.error('浏览记录写入失败:', err.message);
        })
      );

      recommendedUsers.push(userForRecommend);
      if (recommendedUsers.length >= limit) break;
    }

    // 异步写入浏览记录（不阻塞返回，静默失败）
    Promise.allSettled(viewPromises).catch(() => {});

    // 智能排序：用匹配算法对推荐用户按分数降序排列
    if (recommendedUsers.length > 1) {
      try {
        const scored = await MatchAlgorithm.reRankUsers(currentUser, recommendedUsers);
        return scored;
      } catch (algoErr) {
        console.error('匹配算法排序失败，使用默认排序:', algoErr.message);
      }
    }

    return recommendedUsers;
  } catch (err) {
    console.error('推荐用户失败:', err);
    return [];
  }
}

// ==================== 破冰话题生成 ====================

/** 标签 → 话题模板映射表 */
const ICEBREAKER_TEMPLATES = {
  '健身': '健身达人！你一般多久练一次？',
  '跑步': '跑步爱好者！你一般跑几公里？',
  '瑜伽': '瑜伽让人平静，你练了多久了？',
  '篮球': '篮球场上见！你打什么位置？',
  '游泳': '游泳健将！你喜欢泳池还是海边？',
  '滑雪': '滑雪超酷！单板还是双板？',
  '冲浪': '冲浪也太帅了吧！在哪里学过？',
  '旅行': '你们都爱旅行，最近去过哪里？',
  '美食': '你们都喜欢美食，要不要聊聊最爱的餐厅？',
  '摄影': '你们都爱摄影，用什么设备拍？',
  '宠物': '你们都养宠物吗？什么品种？',
  '音乐': '你们最近在听什么歌？',
  '电影': '你们最近看了什么好电影？',
  '游戏': '你们玩什么游戏？可以一起组队！',
  '读书': '你们都喜欢读书，最近在读什么？',
  '画画': '你们都喜欢画画，什么风格？',
};

/**
 * 根据共同标签生成破冰话题列表
 * @param {string[]} commonTags - 交集标签数组
 * @returns {string[]} - 2-3 条话题文案
 */
function generateIcebreakers(commonTags) {
  if (!commonTags || commonTags.length === 0) return [];
  const topics = [];
  const tags = commonTags.slice(0, 3);
  for (const tag of tags) {
    let template = null;
    for (const [key, value] of Object.entries(ICEBREAKER_TEMPLATES)) {
      if (tag.includes(key) || key.includes(tag)) {
        template = value;
        break;
      }
    }
    topics.push(template || `你们有很多共同爱好（${tag}），来聊聊吧！`);
  }
  return topics.slice(0, 3);
}

/**
 * 安全解析用户 tags 字段
 * @param {*} tagsField - 数据库 tags 列
 * @returns {string[]}
 */
function parseTags(tagsField) {
  if (!tagsField) return [];
  if (Array.isArray(tagsField)) return tagsField;
  if (typeof tagsField === 'string') {
    try { return JSON.parse(tagsField); } catch (e) { return []; }
  }
  return [];
}

/**
 * 处理用户喜欢
 * @param {number} user_id - 用户ID
 * @param {number} target_user_id - 目标用户ID
 * @returns {Promise<Object>} - 处理结果
 */
async function handleLike(user_id, target_user_id) {
  try {
    const isBlocked = await Block.isMutualBlocked(user_id, target_user_id);
    if (isBlocked) {
      return { success: false, message: '无法操作，存在拉黑关系' };
    }

    const targetUser = await User.findById(target_user_id);
    if (!targetUser) {
      throw new Error('目标用户不存在');
    }

    const liked = await Like.exists(user_id, target_user_id);
    if (liked) {
      throw new Error('已经喜欢过该用户');
    }

    // 每日配额检查
    const UserDailyQuota = require('../models/UserDailyQuota');
    const canLike = await UserDailyQuota.canLike(user_id);
    if (!canLike) {
      return { success: false, message: '今日喜欢次数已用完（20次/天），VIP无限制' };
    }

    const matched = await Match.exists(user_id, target_user_id);
    if (matched) {
      throw new Error('已经匹配过该用户');
    }

    await Like.create(user_id, target_user_id);

    // 递增配额 + 记录滑动撤销
    UserDailyQuota.incrementLike(user_id).catch(() => {});
    try { const rs = require('./redis.undo.service'); rs.recordSwipe(user_id, target_user_id, 'like').catch(() => {}); } catch (e) {}

    // 记录用户行为：喜欢
    MatchAlgorithm.recordBehavior(user_id, target_user_id, 'like');

    const mutualLike = await Like.exists(target_user_id, user_id);

    if (mutualLike) {
      // ============ 匹配成功 ============
      const match = await Match.create(user_id, target_user_id);

      // 获取双方完整信息
      const [currentUser, partner] = await Promise.all([
        User.findById(user_id),
        User.findById(target_user_id)
      ]);

      // 创建会话
      const conversation = await Conversation.createOrGet(user_id, target_user_id);

      // 初始化亲密关系（fire-and-forget）
      try { const is = require('./intimacy.service'); is.onMatch(user_id, target_user_id).catch(() => {}); } catch (e) {}

      // 发送系统消息：互相喜欢
      await Message.create({
        conversation_id: conversation.id,
        sender_id: 0,
        receiver_id: user_id,
        content: '💕 你们互相喜欢，开始聊天吧！',
        type: 99
      });

      // 计算共同标签并生成破冰话题
      const userTags = parseTags(currentUser.tags);
      const targetTags = parseTags(partner.tags);
      const commonTags = userTags.filter(t => targetTags.includes(t));

      const icebreakers = generateIcebreakers(commonTags);
      const icebreakerMessages = [];
      for (const topic of icebreakers) {
        const msg = await Message.create({
          conversation_id: conversation.id,
          sender_id: 0,
          receiver_id: user_id,
          content: `💬 ${topic}`,
          type: 99
        });
        icebreakerMessages.push({ id: msg.id, content: topic });
      }

      // WebSocket 实时推送双方
      const partnerData = { id: partner.id, nickname: partner.nickname, avatar: partner.avatar, gender: partner.gender, age: partner.age, location: partner.location };
      const currentData = { id: currentUser.id, nickname: currentUser.nickname, avatar: currentUser.avatar, gender: currentUser.gender, age: currentUser.age, location: currentUser.location };

      websocketService.sendToUser(user_id, {
        type: 'match_success',
        data: { match_id: match.id, conversation_id: conversation.id, partner: partnerData, common_tags: commonTags, icebreakers: icebreakerMessages }
      });
      websocketService.sendToUser(target_user_id, {
        type: 'match_success',
        data: { match_id: match.id, conversation_id: conversation.id, partner: currentData, common_tags: commonTags, icebreakers: icebreakerMessages }
      });

      // 推送通知（异步）
      pushService.sendToUser(target_user_id, {
        title: '💕 新的匹配！',
        body: `${currentUser.nickname || '有人'} 也喜欢了你，快去聊天吧！`,
        data: { type: 'match', match_id: match.id, user_id }
      }).catch(() => {});
      pushService.sendToUser(user_id, {
        title: '💕 匹配成功',
        body: `你和 ${partner.nickname || 'TA'} 互相喜欢，开始聊天吧！`,
        data: { type: 'match', match_id: match.id, user_id: target_user_id }
      }).catch(() => {});

      return {
        success: true,
        matched: true,
        match_id: match.id,
        conversation_id: conversation.id,
        partner: partnerData,
        common_tags: commonTags,
        icebreakers: icebreakerMessages,
        message: '匹配成功！'
      };
    }

    return { success: true, matched: false, message: '喜欢成功' };
  } catch (err) {
    console.error('处理喜欢失败:', err);
    return { success: false, message: err.message };
  }
}

/**
 * 处理用户跳过
 * @param {number} user_id - 用户ID
 * @param {number} target_user_id - 目标用户ID
 * @returns {Promise<Object>} - 处理结果
 */
async function handleSkip(user_id, target_user_id) {
  try {
    const targetUser = await User.findById(target_user_id);
    if (!targetUser) {
      throw new Error('目标用户不存在');
    }

    const alreadySkipped = await Skip.exists(user_id, target_user_id);
    if (alreadySkipped) {
      return { success: true, message: '已跳过该用户' };
    }

    await Skip.create(user_id, target_user_id);

    // 记录滑动撤销
    try { const rs = require('./redis.undo.service'); rs.recordSwipe(user_id, target_user_id, 'skip').catch(() => {}); } catch (e) {}

    // 记录用户行为：跳过
    MatchAlgorithm.recordBehavior(user_id, target_user_id, 'skip');

    return {
      success: true,
      message: '跳过成功'
    };
  } catch (err) {
    console.error('处理跳过失败:', err);
    return {
      success: false,
      message: err.message
    };
  }
}

/**
 * 处理超级喜欢
 */
async function handleSuperLike(user_id, target_user_id) {
  try {
    const UserDailyQuota = require('../models/UserDailyQuota');
    const Wallet = require('../models/Wallet');

    const isBlocked = await Block.isMutualBlocked(user_id, target_user_id);
    if (isBlocked) return { success: false, message: '无法操作，存在拉黑关系' };

    const targetUser = await User.findById(target_user_id);
    if (!targetUser) throw new Error('目标用户不存在');

    const liked = await Like.exists(user_id, target_user_id);
    if (liked) throw new Error('已经喜欢过该用户');

    const canSL = await UserDailyQuota.canSuperLike(user_id);
    if (!canSL) return { success: false, message: '今日超级喜欢次数已用完（5次/天）' };

    // 扣10金币
    const spendResult = await Wallet.spend(user_id, 10, 'super_like');
    if (!spendResult || !spendResult.success) return { success: false, message: '金币不足，超级喜欢需要10金币' };

    await Like.create(user_id, target_user_id, 2);
    UserDailyQuota.incrementSuperLike(user_id).catch(() => {});
    try { const rs = require('./redis.undo.service'); rs.recordSwipe(user_id, target_user_id, 'super_like').catch(() => {}); } catch (e) {}

    MatchAlgorithm.recordBehavior(user_id, target_user_id, 'super_like');

    // 通知目标用户
    websocketService.sendToUser(target_user_id, {
      type: 'super_like_received',
      data: { user_id, timestamp: new Date().toISOString() }
    });

    return { success: true, message: '超级喜欢成功' };
  } catch (err) {
    console.error('超级喜欢失败:', err);
    return { success: false, message: err.message };
  }
}

/**
 * 撤销最后一次滑动（3秒内有效）
 */
async function handleUndo(user_id) {
  try {
    const redisUndo = require('./redis.undo.service');
    const lastSwipe = await redisUndo.getLastSwipe(user_id);
    if (!lastSwipe) return { success: false, message: '无可撤销的滑动（仅3秒内有效）' };

    const { action, target_user_id } = lastSwipe;
    if (action === 'like' || action === 'super_like') {
      // 从likes表删除
      const { executeQuery } = require('../utils/database');
      await executeQuery('DELETE FROM likes WHERE user_id = ? AND target_user_id = ? ORDER BY created_at DESC LIMIT 1', [user_id, target_user_id]);
    } else if (action === 'skip') {
      const { executeQuery } = require('../utils/database');
      await executeQuery('DELETE FROM skips WHERE user_id = ? AND target_user_id = ? ORDER BY created_at DESC LIMIT 1', [user_id, target_user_id]);
    }
    await redisUndo.clearSwipe(user_id);
    return { success: true, message: '撤销成功' };
  } catch (err) {
    return { success: false, message: err.message };
  }
}

module.exports = {
  recommendUsers,
  handleLike,
  handleSkip,
  handleSuperLike,
  handleUndo
};
