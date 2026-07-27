// 文件名：src/services/offlineMessage.service.js
// 用途：离线消息存储服务
// 当用户不在线时，将消息存储到Redis，用户上线后推送

const { getClient, isRedisAvailable } = require('../config/redis');

// 离线消息在Redis中的过期时间（7天）
const OFFLINE_MESSAGE_TTL = 7 * 24 * 60 * 60;

// 每个用户最多存储的离线消息数量
const MAX_OFFLINE_MESSAGES = 500;

class OfflineMessageService {
  /**
   * 存储离线消息
   * @param {number} userId - 接收者用户ID
   * @param {Object} messageObj - 消息对象
   * @returns {Promise<boolean>}
   */
  async storeMessage(userId, messageObj) {
    try {
      if (!isRedisAvailable()) {
        console.warn('[OfflineMessage] Redis不可用，跳过离线消息存储');
        return false;
      }

      const client = getClient();
      const key = `offline_messages:${userId}`;
      
      // 将消息序列化后添加到列表
      const messageStr = JSON.stringify({
        ...messageObj,
        stored_at: new Date().toISOString()
      });
      
      await client.lPush(key, messageStr);
      
      // 限制列表长度，删除超过限制的旧消息
      await client.lTrim(key, 0, MAX_OFFLINE_MESSAGES - 1);
      
      // 设置过期时间
      await client.expire(key, OFFLINE_MESSAGE_TTL);
      
      console.log(`[OfflineMessage] 已为用户 ${userId} 存储离线消息`);
      return true;
    } catch (error) {
      console.error('[OfflineMessage] 存储离线消息失败:', error.message);
      return false;
    }
  }

  /**
   * 获取用户的离线消息
   * @param {number} userId - 用户ID
   * @returns {Promise<Array>}
   */
  async getOfflineMessages(userId) {
    try {
      if (!isRedisAvailable()) {
        return [];
      }

      const client = getClient();
      const key = `offline_messages:${userId}`;
      
      // 获取所有离线消息
      const messages = await client.lRange(key, 0, -1);
      
      if (messages.length === 0) {
        return [];
      }
      
      // 解析消息
      const parsedMessages = messages
        .map(msg => {
          try {
            return JSON.parse(msg);
          } catch (e) {
            return null;
          }
        })
        .filter(Boolean);
      
      // 删除已获取的离线消息
      await client.del(key);
      
      console.log(`[OfflineMessage] 已为用户 ${userId} 获取 ${parsedMessages.length} 条离线消息`);
      return parsedMessages;
    } catch (error) {
      console.error('[OfflineMessage] 获取离线消息失败:', error.message);
      return [];
    }
  }

  /**
   * 获取用户的离线消息数量
   * @param {number} userId - 用户ID
   * @returns {Promise<number>}
   */
  async getOfflineMessageCount(userId) {
    try {
      if (!isRedisAvailable()) {
        return 0;
      }

      const client = getClient();
      const key = `offline_messages:${userId}`;
      
      const count = await client.lLen(key);
      return count;
    } catch (error) {
      console.error('[OfflineMessage] 获取离线消息数量失败:', error.message);
      return 0;
    }
  }

  /**
   * 清除用户的离线消息
   * @param {number} userId - 用户ID
   * @returns {Promise<boolean>}
   */
  async clearOfflineMessages(userId) {
    try {
      if (!isRedisAvailable()) {
        return false;
      }

      const client = getClient();
      const key = `offline_messages:${userId}`;
      
      await client.del(key);
      console.log(`[OfflineMessage] 已清除用户 ${userId} 的离线消息`);
      return true;
    } catch (error) {
      console.error('[OfflineMessage] 清除离线消息失败:', error.message);
      return false;
    }
  }
}

module.exports = new OfflineMessageService();
