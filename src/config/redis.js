/**
 * Redis连接配置
 * 用于创建和管理Redis客户端连接
 * 采用单例模式，确保全局只有一个Redis客户端实例
 *
 * 阿里云ECS部署注意事项：
 * - Redis默认仅监听127.0.0.1，无需开放外网端口
 * - 必须设置 requirepass 密码（setup-ecs.sh 自动配置）
 * - ECS内存1-2G时建议设置 maxmemory 256mb
 */

const redis = require('redis');

// Redis客户端实例
let client = null;
// 连接状态追踪
let isConnecting = false;     // 正在连接中（防止并发连接）
let isConnected = false;      // 已连接且就绪
let connectionFailed = false; // 连接彻底失败
let lastConnectionAttempt = 0;
let consecutiveFailures = 0;  // 连续失败次数

// 冷却策略（渐进式退避）
const BASE_COOLDOWN = 5000;       // 初始冷却5秒
const MAX_COOLDOWN = 60000;       // 最大冷却60秒
const MAX_RETRIES = 10;           // 最大重试次数（超过后进入长冷却）
const MAX_CONSECUTIVE_FAILURES = 5; // 连续失败此数后判定彻底失败

/**
 * 计算当前冷却时间（渐进退避）
 */
function getCooldown() {
  if (consecutiveFailures === 0) return 0;
  // 5s → 10s → 20s → 40s → 60s（封顶）
  return Math.min(BASE_COOLDOWN * Math.pow(2, consecutiveFailures - 1), MAX_COOLDOWN);
}

/**
 * 获取Redis客户端（单例模式）
 * @returns {Object|null} - Redis客户端实例或null
 */
function getClient() {
  if (!client) {
    try {
      const redisUrl = `redis://${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || 6379}`;

      // 创建Redis客户端（redis v4: createClient后需手动 connect）
      client = redis.createClient({
        url: redisUrl,
        password: process.env.REDIS_PASSWORD || undefined,
        database: parseInt(process.env.REDIS_DB || '0', 10),
        socket: {
          connectTimeout: 10000,       // 10秒连接超时
          reconnectStrategy: (retries) => {
            consecutiveFailures = retries;

            // 超过最大重试次数，进入长冷却但仍不放弃
            if (retries > MAX_RETRIES) {
              console.error(`[Redis] 已重试 ${retries} 次，暂停自动重连（将每60秒尝试一次）`);
              connectionFailed = true;
              // 返回60秒后重试，而不是 false（false=永不重连）
              return MAX_COOLDOWN;
            }

            // 渐进退避：100ms, 200ms, 400ms, 800ms, 1.6s, 3.2s...
            const delay = Math.min(100 * Math.pow(2, retries), 5000);
            if (retries <= 3) {
              console.log(`[Redis] 第 ${retries} 次重连，${delay}ms 后重试...`);
            }
            return delay;
          }
        }
      });

      // 连接事件
      client.on('connect', () => {
        console.log('[Redis] TCP连接已建立');
      });

      client.on('ready', () => {
        console.log('[Redis] 客户端就绪');
        isConnected = true;
        isConnecting = false;
        connectionFailed = false;
        consecutiveFailures = 0;
      });

      // 错误事件处理（redis v4 必须监听 error，否则未捕获错误会 crash 进程）
      client.on('error', (err) => {
        // ECONNREFUSED/ENOTFOUND 等连接级错误仅在首次连接时是关键错误
        // 已建立连接后的运行时错误（如 READONLY）只记录不崩溃
        if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND' || err.code === 'ETIMEDOUT') {
          console.error(`[Redis] 连接错误 (${err.code}): ${err.message}`);
        } else {
          console.error(`[Redis] 运行时错误: ${err.message}`);
        }
        isConnected = false;
      });

      // 重连事件
      client.on('reconnecting', () => {
        console.log('[Redis] 正在重连...');
      });

      // 关闭事件
      client.on('end', () => {
        console.log('[Redis] 连接已关闭');
        isConnected = false;
        isConnecting = false;
      });
    } catch (error) {
      console.error('[Redis] 创建客户端失败:', error.message);
      connectionFailed = true;
      return null;
    }
  }
  return client;
}

/**
 * 确保Redis已连接
 * @returns {Promise<boolean>} - 连接是否成功
 */
async function ensureConnected() {
  const redisClient = getClient();
  if (!redisClient) return false;

  // 已连接且就绪
  if (isConnected && redisClient.isReady) return true;

  // 正在连接中，避免并发连接
  if (isConnecting) {
    // 等待最多5秒让正在进行的连接完成
    for (let i = 0; i < 50; i++) {
      await new Promise(r => setTimeout(r, 100));
      if (isConnected && redisClient.isReady) return true;
      if (!isConnecting) break; // 连接已完成（可能失败）
    }
    // 等待超时，返回当前状态
    return isConnected && redisClient.isReady;
  }

  // 检查冷却期
  const now = Date.now();
  const cooldown = getCooldown();
  if (connectionFailed && (now - lastConnectionAttempt) < cooldown) {
    return false;
  }

  // 尝试连接
  try {
    isConnecting = true;
    lastConnectionAttempt = now;

    // redis v4: 如果客户端从未连接过或已断开，调用 connect()
    if (!redisClient.isOpen) {
      await redisClient.connect();
    }

    isConnected = true;
    connectionFailed = false;
    consecutiveFailures = 0;
    return true;
  } catch (error) {
    consecutiveFailures++;
    isConnected = false;

    // 连续失败过多时标记彻底失败
    if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      connectionFailed = true;
    }

    console.error(`[Redis] 连接失败 (第${consecutiveFailures}次): ${error.message}`);
    return false;
  } finally {
    isConnecting = false;
  }
}

/**
 * 测试Redis连接
 * @param {Object} options - 可选配置
 * @param {boolean} options.silent - 静默模式
 * @returns {Promise<{success: boolean, error?: string, latency?: number, diagnosis?: string}>}
 */
async function testConnection(options = {}) {
  const connected = await ensureConnected();
  if (!connected) {
    return {
      success: false,
      error: 'Redis未连接',
      diagnosis: diagnoseRedisFailure()
    };
  }

  try {
    const startTime = Date.now();
    await client.ping();
    const latency = Date.now() - startTime;

    if (!options.silent) {
      console.log(`[Redis] 连接测试成功 (延迟: ${latency}ms)`);
    }

    return { success: true, latency };
  } catch (error) {
    if (!options.silent) {
      console.error(`[Redis] PING测试失败: ${error.message}`);
    }
    return {
      success: false,
      error: error.message,
      diagnosis: diagnoseRedisFailure()
    };
  }
}

/**
 * 诊断Redis连接失败原因
 * @returns {string} - 诊断建议
 */
function diagnoseRedisFailure() {
  const host = process.env.REDIS_HOST || 'localhost';
  const port = process.env.REDIS_PORT || 6379;

  return [
    `请依次检查:`,
    `  1) Redis服务状态: systemctl status redis`,
    `  2) Redis监听地址: ss -tlnp | grep ${port}（应为127.0.0.1:${port}）`,
    `  3) Redis密码配置: grep requirepass /etc/redis.conf`,
    `  4) .env中REDIS_PASSWORD是否与/etc/redis.conf中一致`,
    `  5) Redis内存: redis-cli -a <密码> INFO memory | grep used_memory_human`,
  ].join('\n');
}

/**
 * 检查Redis是否可用
 * @returns {boolean} - Redis是否可用
 */
function isRedisAvailable() {
  return isConnected && client && client.isReady;
}

/**
 * 获取Redis连接健康状态
 * @returns {Object}
 */
function getRedisStatus() {
  return {
    available: isRedisAvailable(),
    connected: isConnected,
    connecting: isConnecting,
    failed: connectionFailed,
    consecutiveFailures,
    cooldown: getCooldown(),
    lastAttempt: lastConnectionAttempt ? new Date(lastConnectionAttempt).toISOString() : null
  };
}

// ==================== 通用缓存辅助方法 ====================

/**
 * 从 Redis 获取缓存数据（自动 JSON.parse）
 * Redis 不可用时返回 null，降级到直接查数据库
 *
 * @param {string} key - 缓存键
 * @returns {Promise<*>} - 解析后的数据，不存在或失败返回 null
 */
async function cacheGet(key) {
  try {
    if (!isRedisAvailable()) return null;
    const val = await client.get(key);
    return val ? JSON.parse(val) : null;
  } catch (err) {
    console.error(`[Redis] cacheGet(${key}) 失败:`, err.message);
    return null;
  }
}

/**
 * 存入 Redis 缓存（自动 JSON.stringify + TTL）
 *
 * @param {string} key - 缓存键
 * @param {*} value - 要缓存的数据（任意 JSON 可序列化类型）
 * @param {number} [ttlSeconds=300] - 过期时间（秒），默认5分钟
 * @returns {Promise<boolean>} - 是否写入成功
 */
async function cacheSet(key, value, ttlSeconds) {
  try {
    if (!isRedisAvailable()) return false;
    const ttl = ttlSeconds && ttlSeconds > 0 ? ttlSeconds : 300;
    const serialized = JSON.stringify(value);
    await client.setEx(key, ttl, serialized);
    return true;
  } catch (err) {
    console.error(`[Redis] cacheSet(${key}) 失败:`, err.message);
    return false;
  }
}

/**
 * 删除指定缓存键
 *
 * @param {string} key - 缓存键
 * @returns {Promise<boolean>}
 */
async function cacheDel(key) {
  try {
    if (!isRedisAvailable()) return false;
    await client.del(key);
    return true;
  } catch (err) {
    console.error(`[Redis] cacheDel(${key}) 失败:`, err.message);
    return false;
  }
}

/**
 * 按模式批量删除缓存（如 user:1:*）
 * 使用 SCAN + DEL 避免 KEYS 阻塞线上服务
 *
 * @param {string} pattern - 匹配模式，如 "user:1:*"
 * @returns {Promise<number>} - 删除的键数量
 */
async function cacheDelPattern(pattern) {
  try {
    if (!isRedisAvailable()) return 0;
    let deleted = 0;
    let cursor = 0;
    do {
      const reply = await client.scan(cursor, { MATCH: pattern, COUNT: 100 });
      cursor = reply.cursor;
      const keys = reply.keys;
      if (keys.length > 0) {
        await client.del(keys);
        deleted += keys.length;
      }
    } while (cursor !== 0);
    if (deleted > 0) {
      console.log(`[Redis] 批量删除 ${deleted} 个缓存键: ${pattern}`);
    }
    return deleted;
  } catch (err) {
    console.error(`[Redis] cacheDelPattern(${pattern}) 失败:`, err.message);
    return 0;
  }
}

module.exports = {
  getClient,
  ensureConnected,
  testConnection,
  isRedisAvailable,
  getRedisStatus,
  cacheGet,
  cacheSet,
  cacheDel,
  cacheDelPattern,
  get client() { return getClient(); }
};