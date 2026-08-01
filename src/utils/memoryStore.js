/**
 * 内存存储工具（DB/Redis 不可用时的降级存储单例）
 *
 * 提供：
 * - createMapStore()：返回 { map, nextId } —— 内存 Map + 自增ID，供 model 降级用
 * - 各 model 通过 require 复用，避免散落的 `new Map()` + `let autoIncrementId`
 *
 * 注：本工具为渐进式收敛入口。存量 model 各自 `new Map()` 的写法保持兼容，
 *     新 model 或重构时统一走本工具。
 */

/**
 * 创建内存存储实例
 * @param {Object} [opts]
 * @param {boolean} [opts.useAutoId=true] - 是否附带自增ID分配器
 * @returns {{ map: Map, nextId: Function }}
 */
function createMapStore(opts = {}) {
  const { useAutoId = true } = opts;
  const map = new Map();
  let autoIncrementId = 1;

  return {
    map,
    /** 分配下一个自增ID */
    nextId: () => (useAutoId ? autoIncrementId++ : null),
    /** 读取或初始化一条记录（key 不存在时写入 seed 值） */
    getOrSet(key, seed) {
      if (!map.has(key)) map.set(key, typeof seed === 'function' ? seed() : seed);
      return map.get(key);
    },
    /** 清空（测试用） */
    clear() {
      map.clear();
      autoIncrementId = 1;
    },
  };
}

module.exports = { createMapStore };
