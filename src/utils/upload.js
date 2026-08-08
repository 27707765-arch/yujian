/**
 * 上传资源 URL 归一化工具
 * 修复历史遗留：上传接口曾返回 '/filename' 裸路径（缺少 /uploads 前缀），
 * 导致通过返回 URL 无法访问静态资源。这里在读取出口做读侧兼容，
 * 不动数据库（避免多表 JSON 迁移风险）。
 *
 * 规则：
 * - http(s):// / data: / /uploads/ 开头 → 原样返回（绝对URL与已正确前缀）
 * - 以 / 开头的裸路径 → 补 /uploads/ 前缀
 * - 其它（null/undefined/空串/相对路径）→ 原样返回
 */

/**
 * 归一化单个上传资源 URL
 * @param {string|null} url
 * @returns {string|null}
 */
function normalizeUploadUrl(url) {
  if (!url || typeof url !== 'string') return url;
  const t = url.trim();
  if (!t) return t;
  if (t.startsWith('http://') || t.startsWith('https://') || t.startsWith('data:') || t.startsWith('/uploads/')) return t;
  if (t.startsWith('/')) return '/uploads/' + t.slice(1);
  return t;
}

/**
 * 归一化上传资源 URL 数组（动态 images / 相册列表等）
 * @param {Array<string>|null} list
 * @returns {Array<string>|null}
 */
function normalizeUploadUrls(list) {
  if (!Array.isArray(list)) return list;
  return list.map(normalizeUploadUrl);
}

/**
 * 安全解析数据库中的 images 字段
 * 兼容三种来源格式：
 * 1. MySQL JSON 列 → mysql2 自动解析为数组（最常见）
 * 2. JSON 字符串（如 '["/uploads/a.png"]'）
 * 3. 裸路径字符串（历史遗留，如 '/uploads/a.png' 或 '/a.png'）
 * 解析后统一做 /uploads/ 前缀归一。
 * @param {*} value - posts.images / community_posts.images 等字段值
 * @returns {Array<string>}
 */
function parseImagesField(value) {
  // 已是数组：直接归一
  if (Array.isArray(value)) return normalizeUploadUrls(value);
  // null / undefined / 空
  if (!value) return [];
  // JSON 字符串：尝试解析
  if (typeof value === 'string') {
    const t = value.trim();
    // 以 [ 开头视为 JSON 数组字符串
    if (t.startsWith('[')) {
      try {
        const arr = JSON.parse(t);
        return Array.isArray(arr) ? normalizeUploadUrls(arr) : [];
      } catch (e) {
        return [];
      }
    }
    // 裸路径字符串（历史遗留单张图片，以 / 开头）：包成数组并归一
    // 其它非路径字符串（如 JSON 对象）不属于图片，返回空数组
    if (t.startsWith('/')) {
      return [normalizeUploadUrl(t)];
    }
    return [];
  }
  return [];
}

module.exports = { normalizeUploadUrl, normalizeUploadUrls, parseImagesField };
