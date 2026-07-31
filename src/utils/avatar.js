/**
 * 随机头像工具模块
 * 为新注册用户随机分配头像，区分男性和女性
 * 使用 DiceBear API 提供免费头像
 */

// 男性头像风格列表（使用 DiceBear API）
const MALE_STYLES = [
  'adventurer',
  'adventurer-neutral',
  'avataaars',
  'big-ears',
  'big-smile',
  'bottts',
  'fun-emoji',
  'icons',
  'identicon',
  'lorelei',
  'micah',
  'miniavs',
  'personas',
  'pixel-art'
];

// 女性头像风格列表
const FEMALE_STYLES = [
  'adventurer',
  'adventurer-neutral',
  'avataaars',
  'big-ears',
  'big-smile',
  'bottts',
  'fun-emoji',
  'icons',
  'identicon',
  'lorelei',
  'micah',
  'miniavs',
  'personas',
  'pixel-art'
];

/**
 * 生成随机字符串作为头像种子
 * @param {number} length - 字符串长度
 * @returns {string} 随机字符串
 */
function generateRandomSeed(length = 12) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * 根据性别获取随机头像URL
 * @param {number} gender - 性别 (1=男, 2=女, 其他=随机)
 * @returns {string} 头像URL
 */
function getRandomAvatar(gender) {
  // 确定使用哪种风格列表
  let style;
  if (gender === 1) {
    // 男性
    style = MALE_STYLES[Math.floor(Math.random() * MALE_STYLES.length)];
  } else if (gender === 2) {
    // 女性
    style = FEMALE_STYLES[Math.floor(Math.random() * FEMALE_STYLES.length)];
  } else {
    // 未知性别，随机选择
    const allStyles = [...new Set([...MALE_STYLES, ...FEMALE_STYLES])];
    style = allStyles[Math.floor(Math.random() * allStyles.length)];
  }

  // 生成随机种子确保每次获取不同的头像
  const seed = generateRandomSeed();

  // 构建 DiceBear API URL
  const avatarUrl = `https://api.dicebear.com/7.x/${style}/svg?seed=${seed}`;

  return avatarUrl;
}

/**
 * 获取多个随机头像URL（用于预览或选择）
 * @param {number} gender - 性别 (1=男, 2=女)
 * @param {number} count - 数量
 * @returns {string[]} 头像URL数组
 */
function getRandomAvatars(gender, count = 4) {
  const avatars = [];
  for (let i = 0; i < count; i++) {
    avatars.push(getRandomAvatar(gender));
  }
  return avatars;
}

module.exports = {
  getRandomAvatar,
  getRandomAvatars
};
