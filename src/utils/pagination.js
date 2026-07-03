/**
 * 通用分页参数处理
 * 统一限制 limit/offset 范围，防止恶意请求消耗数据库资源
 */

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/**
 * 规范化分页参数
 * @param {*} limit - 请求中的 limit 参数
 * @param {*} offset - 请求中的 offset 参数
 * @returns {{ limit: number, offset: number }}
 */
function normalizePagination(limit, offset) {
  let l = parseInt(limit, 10);
  let o = parseInt(offset, 10);

  if (isNaN(l) || l <= 0) l = DEFAULT_LIMIT;
  if (l > MAX_LIMIT) l = MAX_LIMIT;
  if (isNaN(o) || o < 0) o = 0;

  return { limit: l, offset: o };
}

module.exports = { normalizePagination, DEFAULT_LIMIT, MAX_LIMIT };
