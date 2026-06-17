/**
 * 数据库工具函数模块
 * 用于管理数据库连接状态和执行数据库查询
 * 提供数据库连接检查和查询执行功能
 * 当数据库不可用时，会自动标记为不可用状态
 */

const { pool } = require('../config/database');

// 数据库可用性标志，默认为true
let dbAvailable = true;

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
    return true;
  } catch (error) {
    // 连接失败，更新可用性标志并记录错误
    dbAvailable = false;
    console.error('数据库连接失败:', error.message);
    return false;
  }
}

/**
 * 获取数据库当前的可用性状态
 * @returns {boolean} - 数据库可用性状态
 */
function isDbAvailable() {
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
      return await pool.execute(query, params);
    }
    // 数据库不可用，返回null
    return null;
  } catch (error) {
    // 查询失败，更新数据库可用性状态并记录错误
    dbAvailable = false;
    console.error('数据库查询失败:', error.message);
    return null;
  }
}

module.exports = {
  checkDbConnection, // 检查数据库连接状态
  isDbAvailable,     // 获取数据库可用性状态
  executeQuery       // 执行数据库查询
};
