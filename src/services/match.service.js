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

/**
 * 推荐用户
 * @param {number} user_id - 用户ID
 * @param {Object} filters - 筛选条件
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

    const { ageMin = 18, ageMax = 35, distance = 10, limit = 10 } = filters;

    // 获取附近的用户
    let users = [];
    if (currentUser.lat && currentUser.lng) {
      users = await User.getNearbyUsers(
        user_id,
        currentUser.lat,
        currentUser.lng,
        distance,
        limit * 3 // 多取一些，因为需要多层过滤
      );
    } else {
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

    // 进一步过滤
    const recommendedUsers = [];
    for (const user of ageFiltered) {
      // 排除已跳过和拉黑相关
      if (excludedIds.has(user.id)) continue;

      // 检查是否已喜欢
      const liked = await Like.exists(user_id, user.id);
      if (liked) continue;

      // 检查是否已匹配
      const matched = await Match.exists(user_id, user.id);
      if (matched) continue;

      // 检查目标用户的隐私设置（是否允许陌生人聊天等不影响推荐展示）

      // 异步记录浏览（不阻塞推荐返回）
      View.create(user_id, user.id).catch(err => {
        console.error('浏览记录写入失败:', err.message);
      });

      // 处理隐私：如果用户隐藏距离，则不返回具体距离
      let userForRecommend = { ...user };
      try {
        const targetSettings = await UserSettings.get(user.id);
        if (targetSettings.hide_distance) {
          userForRecommend._distance_hidden = true;
        }
      } catch (settingsErr) {
        // 获取设置失败不影响推荐
      }

      recommendedUsers.push(userForRecommend);
      if (recommendedUsers.length >= limit) break;
    }

    return recommendedUsers;
  } catch (err) {
    console.error('推荐用户失败:', err);
    return [];
  }
}

/**
 * 处理用户喜欢
 * @param {number} user_id - 用户ID
 * @param {number} target_user_id - 目标用户ID
 * @returns {Promise<Object>} - 处理结果
 */
async function handleLike(user_id, target_user_id) {
  try {
    // 检查是否存在拉黑关系
    const isBlocked = await Block.isMutualBlocked(user_id, target_user_id);
    if (isBlocked) {
      return { success: false, message: '无法操作，存在拉黑关系' };
    }

    // 检查目标用户是否存在
    const targetUser = await User.findById(target_user_id);
    if (!targetUser) {
      throw new Error('目标用户不存在');
    }

    // 检查是否已喜欢
    const liked = await Like.exists(user_id, target_user_id);
    if (liked) {
      throw new Error('已经喜欢过该用户');
    }

    // 检查是否已匹配
    const matched = await Match.exists(user_id, target_user_id);
    if (matched) {
      throw new Error('已经匹配过该用户');
    }

    // 创建喜欢记录
    await Like.create(user_id, target_user_id);

    // 检查对方是否也喜欢了自己
    const mutualLike = await Like.exists(target_user_id, user_id);

    if (mutualLike) {
      // 创建匹配记录
      const match = await Match.create(user_id, target_user_id);
      return {
        success: true,
        matched: true,
        match_id: match.id,
        message: '匹配成功！'
      };
    }

    return {
      success: true,
      matched: false,
      message: '喜欢成功'
    };
  } catch (err) {
    console.error('处理喜欢失败:', err);
    return {
      success: false,
      message: err.message
    };
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

module.exports = {
  recommendUsers,
  handleLike,
  handleSkip
};
