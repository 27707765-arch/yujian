/**
 * VIP 特权服务
 * 用于检查用户VIP等级和对应特权
 */

const { executeQuery, isDbAvailable } = require('../utils/database');
const User = require('../models/User');

// VIP 特权缓存
const privilegeCache = new Map();

/**
 * 获取VIP特权配置
 * @param {string} level - VIP等级
 * @returns {Promise<Object>} - 特权键值对
 */
async function getPrivileges(level) {
  if (privilegeCache.has(level)) return privilegeCache.get(level);

  try {
    if (isDbAvailable()) {
      const [rows] = await executeQuery(
        'SELECT * FROM vip_privileges WHERE level = ?', [level]
      );
      const privileges = {};
      rows.forEach(r => { privileges[r.privilege_key] = r.limit_value; });
      privilegeCache.set(level, privileges);
      return privileges;
    }
  } catch (err) {
    console.error('VIP特权查询失败:', err.message);
  }

  // 内存默认值
  const defaults = {
    vip: { daily_likes: 100, daily_views: 50, see_who_liked: 1, read_receipt: 1, chat_sticker: 1 },
    svip: { daily_likes: 0, daily_views: 0, boost_exposure: 3, voice_call: 1, video_call: 1, online_status: 1, chat_translate: 1 }
  };
  return defaults[level] || {};
}

/**
 * 获取用户当前有效VIP等级
 * @param {number} userId - 用户ID
 * @returns {Promise<string>} - normal/vip/svip
 */
async function getUserVipLevel(userId) {
  try {
    const user = await User.findById(userId);
    if (!user) return 'normal';

    // 检查VIP是否过期
    if (user.vip_expire_time && new Date(user.vip_expire_time) > new Date()) {
      return user.vip_level || (user.is_vip ? 'vip' : 'normal');
    }
    return 'normal';
  } catch (err) {
    return 'normal';
  }
}

/**
 * 检查用户是否拥有某特权
 * @param {number} userId - 用户ID
 * @param {string} privilegeKey - 特权标识
 * @returns {Promise<boolean>}
 */
async function hasPrivilege(userId, privilegeKey) {
  const level = await getUserVipLevel(userId);
  if (level === 'normal') return false;

  const privileges = await getPrivileges(level);
  return privileges[privilegeKey] !== undefined;
}

/**
 * 获取特权限制值
 * @param {number} userId - 用户ID
 * @param {string} privilegeKey - 特权标识
 * @param {number} defaultValue - 默认值（普通用户）
 * @returns {Promise<number>} - 限制值（0=无限）
 */
async function getPrivilegeLimit(userId, privilegeKey, defaultValue = 30) {
  const level = await getUserVipLevel(userId);
  const privileges = await getPrivileges(level);
  return privileges[privilegeKey] !== undefined ? privileges[privilegeKey] : defaultValue;
}

/**
 * 获取VIP等级信息（供前端展示）
 * @param {number} userId - 用户ID
 * @returns {Promise<Object>}
 */
async function getVipInfo(userId) {
  const user = await User.findById(userId);
  const level = await getUserVipLevel(userId);
  const privileges = await getPrivileges(level);

  return {
    level,
    is_vip: level !== 'normal',
    expire_time: user ? user.vip_expire_time : null,
    days_remaining: user && user.vip_expire_time
      ? Math.max(0, Math.ceil((new Date(user.vip_expire_time) - new Date()) / 86400000))
      : 0,
    privileges: Object.entries(privileges).map(([key, value]) => ({
      key, value, description: getPrivilegeDescription(key, value)
    }))
  };
}

/**
 * 特权描述（中文）
 */
function getPrivilegeDescription(key, value) {
  const map = {
    daily_likes: value === 0 ? '无限喜欢' : `每日${value}次喜欢`,
    daily_views: value === 0 ? '无限推荐' : `每日${value}次推荐`,
    see_who_liked: '查看谁喜欢了我',
    read_receipt: '消息已读回执',
    chat_sticker: '专属聊天贴纸',
    boost_exposure: `推荐权重提升${value}倍`,
    voice_call: '免费语音通话',
    video_call: '免费视频通话',
    online_status: '查看对方在线状态',
    chat_translate: '多语言翻译'
  };
  return map[key] || key;
}

module.exports = {
  getPrivileges,
  getUserVipLevel,
  hasPrivilege,
  getPrivilegeLimit,
  getVipInfo
};
