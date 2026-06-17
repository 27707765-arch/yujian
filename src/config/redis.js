/**
 * Redis连接配置
 * 用于创建和管理Redis客户端连接
 * 采用单例模式，确保全局只有一个Redis客户端实例
 */

const redis = require('redis');

// Redis客户端实例
let client = null;
// 连接状态
let isConnected = false;

/**
 * 获取Redis客户端（单例模式）
 * @returns {Object|null} - Redis客户端实例或null
 */
function getClient() {
  if (!client) {
    try {
      // 创建Redis客户端
      client = redis.createClient({
        url: `redis://${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || 6379}`,
        password: process.env.REDIS_PASSWORD || undefined,
        database: parseInt(process.env.REDIS_DB || '0'),
        socket: {
          reconnectStrategy: (retries) => {
            if (retries > 3) {
              console.error('Redis重连次数过多，放弃连接');
              return false;
            }
            return Math.min(retries * 100, 3000);
          }
        }
      });

      // 错误事件处理
      client.on('error', (err) => {
        console.error('Redis连接错误:', err.message);
        isConnected = false;
      });

      // 连接成功事件处理
      client.on('connect', () => {
        console.log('Redis连接成功');
        isConnected = true;
      });

      // 连接关闭事件处理
      client.on('end', () => {
        console.log('Redis连接关闭');
        isConnected = false;
      });
    } catch (error) {
      console.error('创建Redis客户端失败:', error.message);
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
  
  try {
    // 检查连接状态，如果未连接则尝试连接
    if (!isConnected || !redisClient.isReady) {
      await redisClient.connect();
    }
    return true;
  } catch (error) {
    console.error('Redis连接失败:', error.message);
    return false;
  }
}

/**
 * 测试Redis连接
 * @returns {Promise<boolean>} - 测试是否成功
 */
async function testConnection() {
  // 确保连接
  const connected = await ensureConnected();
  if (!connected) return false;
  
  try {
    // 发送ping命令测试连接
    await client.ping();
    console.log('Redis连接测试成功');
    return true;
  } catch (error) {
    console.error('Redis连接测试失败:', error.message);
    return false;
  }
}

/**
 * 检查Redis是否可用
 * @returns {boolean} - Redis是否可用
 */
function isRedisAvailable() {
  return isConnected && client && client.isReady;
}

module.exports = {
  getClient,        // 获取Redis客户端
  ensureConnected,  // 确保Redis已连接
  testConnection,   // 测试Redis连接
  isRedisAvailable, // 检查Redis是否可用
  get client() { return getClient(); } // 客户端 getter
};