/**
 * 数据库连接配置
 * 用于创建和管理MySQL数据库连接池
 */

const mysql = require('mysql2/promise');

/**
 * 数据库连接池
 * 使用mysql2/promise创建的连接池，用于管理数据库连接
 */
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',  // 数据库主机，默认为localhost
  port: process.env.DB_PORT || 3306,        // 数据库端口，默认为3306
  user: process.env.DB_USER || 'root',      // 数据库用户名，默认为root
  password: process.env.DB_PASSWORD || '123456',  // 数据库密码，默认为123456
  database: process.env.DB_NAME || 'yujian',      // 数据库名称，默认为yujian
  waitForConnections: true,     // 当连接池无可用连接时，等待而不是抛出错误
  connectionLimit: 10,          // 连接池最大连接数
  queueLimit: 0                 // 连接请求队列限制，0表示无限制
});

/**
 * 测试数据库连接
 * @returns {Promise<boolean>} - 连接是否成功
 */
async function testConnection() {
  try {
    // 获取连接
    const connection = await pool.getConnection();
    console.log('数据库连接成功');
    // 释放连接
    connection.release();
    return true;
  } catch (error) {
    console.error('数据库连接失败:', error);
    return false;
  }
}

module.exports = {
  pool,           // 数据库连接池
  testConnection  // 测试数据库连接的函数
};