/**
 * 数据库工具函数模块
 * 用于管理数据库连接状态和执行数据库查询
 * 提供数据库连接检查和查询执行功能
 * 当数据库不可用时，会自动标记为不可用状态，并定期尝试恢复
 */

const { pool } = require('../config/database');

// 数据库可用性标志
let dbAvailable = true;
// 最后尝试恢复的时间
let lastRecoveryAttempt = 0;
const RECOVERY_COOLDOWN = 30000; // 30秒内不重复尝试恢复
// 连续失败计数
let consecutiveFailures = 0;
const MAX_FAILURES_BEFORE_COOLDOWN = 3;

/**
 * 检查数据库连接状态
 * @returns {Promise<boolean>} - 数据库连接状态，true为可用，false为不可用
 */
async function checkDbConnection() {
  try {
    // 执行简单的SELECT 1查询来测试数据库连接
    await pool.execute('SELECT 1');
    // 连接成功，更新可用性标志
    dbAvailable = true;
    consecutiveFailures = 0;
    return true;
  } catch (error) {
    // 连接失败，更新可用性标志并记录错误
    dbAvailable = false;
    consecutiveFailures++;
    console.error(`[DB] 连接检查失败 (第${consecutiveFailures}次): ${error.message}`);
    return false;
  }
}

/**
 * 获取数据库当前的可用性状态
 * 如果之前不可用且冷却期已过，自动尝试恢复连接
 * @returns {boolean} - 数据库可用性状态
 */
function isDbAvailable() {
  // 如果当前标记为不可用且冷却期已过，尝试异步恢复（fire-and-forget）
  if (!dbAvailable) {
    const now = Date.now();
    if ((now - lastRecoveryAttempt) > RECOVERY_COOLDOWN) {
      lastRecoveryAttempt = now;
      // 异步尝试恢复，不阻塞当前请求（当前请求走内存降级）
      checkDbConnection().then(ok => {
        if (ok) console.log('[DB] ✅ 数据库连接已自动恢复');
      });
    }
  }
  return dbAvailable;
}

/**
 * 执行数据库查询
 * @param {string} query - SQL查询语句
 * @param {Array} params - 查询参数，默认为空数组
 * @returns {Promise<Object|null>} - 查询结果，数据库不可用时返回null
 */
async function executeQuery(query, params = []) {
  try {
    // 检查数据库是否可用
    if (dbAvailable) {
      // 执行查询并返回结果
      const result = await pool.execute(query, params);
      consecutiveFailures = 0; // 成功执行，重置失败计数
      return result;
    }
    // 数据库不可用，返回null
    return null;
  } catch (error) {
    // 根据错误类型判断是否需要标记数据库不可用
    const fatalCodes = ['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'PROTOCOL_CONNECTION_LOST', 'ER_SERVER_SHUTDOWN'];
    const isFatal = fatalCodes.includes(error.code) || error.fatal;

    if (isFatal) {
      consecutiveFailures++;
      if (consecutiveFailures >= MAX_FAILURES_BEFORE_COOLDOWN) {
        dbAvailable = false;
        console.error(`[DB] 连续${consecutiveFailures}次失败，标记数据库不可用（将自动尝试恢复）`);
      }
    } else {
      // 非致命错误（如SQL语法错误、约束违反等），不标记数据库不可用
      console.error(`[DB] 查询错误 (非致命, ${error.code || 'unknown'}): ${error.message}`);
    }

    return null;
  }
}

/**
 * 获取数据库状态详情
 * @returns {Object}
 */
function getDbStatus() {
  return {
    available: dbAvailable,
    consecutiveFailures,
    lastRecoveryAttempt: lastRecoveryAttempt ? new Date(lastRecoveryAttempt).toISOString() : null,
    nextRecoveryIn: dbAvailable ? 0 : Math.max(0, RECOVERY_COOLDOWN - (Date.now() - lastRecoveryAttempt))
  };
}

module.exports = {
  checkDbConnection, // 检查数据库连接状态
  isDbAvailable,     // 获取数据库可用性状态（含自动恢复）
  executeQuery,      // 执行数据库查询
  getDbStatus        // 获取数据库状态详情
};
