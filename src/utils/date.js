/**
 * 日期工具函数模块（纯函数，无 DB/IO 依赖，可独立单元测试）
 * 负责出生日期相关的格式化与周岁计算。
 */

/**
 * 统一格式化 birth_date 为 'YYYY-MM-DD'（本地日历日期）。
 * mysql2 默认将 DATE 列解析为 JS Date，JSON 序列化后变成 UTC ISO 串
 * （如 "1987-02-27T16:00:00.000Z"，UTC+8 下日期倒退一天），导致前端回显乱码、
 * 回传时被格式校验拒绝。此处取本地日历字段还原，避免时区错位。
 * @param {*} v - 数据库返回的 birth_date（Date 或字符串）
 * @returns {string|null}
 */
function formatBirthDate(v) {
  if (!v) return null;
  // 纯 YYYY-MM-DD 字符串直接返回（避免 Date 解析引入时区偏移），但需校验值合法
  if (typeof v === 'string') {
    const m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) {
      const y = parseInt(m[1], 10);
      const mo = parseInt(m[2], 10);
      const da = parseInt(m[3], 10);
      const t = new Date(y, mo - 1, da);
      if (t.getFullYear() === y && t.getMonth() === mo - 1 && t.getDate() === da) {
        return `${m[1]}-${m[2]}-${m[3]}`;
      }
      return null;
    }
  }
  // Date 对象或 ISO 串（含时区）→ 转 Date 后取本地日历字段
  const d = v instanceof Date ? v : new Date(v);
  if (d instanceof Date && !isNaN(d.getTime())) {
    const y = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    const da = String(d.getDate()).padStart(2, '0');
    return `${y}-${mo}-${da}`;
  }
  return null;
}

/**
 * 由出生日期计算周岁
 * @param {string} birthDate - 'YYYY-MM-DD'
 * @returns {number} 周岁；生日未来或非法返回 -1
 */
function calcAgeFromBirth(birthDate) {
  const b = new Date(birthDate + 'T00:00:00');
  if (isNaN(b.getTime())) return -1;
  const now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--;
  if (age < 0) return -1;
  return age;
}

module.exports = {
  formatBirthDate,
  calcAgeFromBirth
};
