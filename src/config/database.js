/**
 * 数据库连接配置
 * 用于创建和管理MySQL数据库连接池
 */

const mysql = require('mysql2/promise');

// 连接池健康状态
let poolHealthy = true;
let lastHealthCheck = 0;
const HEALTH_CHECK_INTERVAL = 30000; // 30秒内不重复检查

/**
 * 数据库连接池
 * 使用mysql2/promise创建的连接池，用于管理数据库连接
 *
 * 超时配置说明（阿里云ECS部署）：
 * - connectTimeout: 建立连接超时，内网通常 <50ms，设置10s兜底
 * - acquireTimeout: 从池中获取连接超时，防止请求无限排队
 * - idleTimeout: 空闲连接回收，默认10分钟，这里设为60s加速回收异常连接
 */
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT, 10) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '123456',
  database: process.env.DB_NAME || 'yujian',
  waitForConnections: true,
  connectionLimit: parseInt(process.env.DB_POOL_SIZE, 10) || 20,  // 公测提升至20连接
  queueLimit: 0,
  connectTimeout: parseInt(process.env.DB_CONNECT_TIMEOUT, 10) || 10000,   // 10秒连接超时
  // mysql2 v3 连接池获取超时（通过 waitForConnections + 回调超时实现）
  enableKeepAlive: true,                                                     // TCP keep-alive
  keepAliveInitialDelay: 10000                                              // 10秒后开始 keep-alive
});

// ==================== 连接池事件监听 ====================

// 连接池从池中分配连接时触发（用于监控连接池压力）
pool.on('acquire', (connection) => {
  // 仅在开发环境输出详细日志
  if (process.env.NODE_ENV !== 'production') {
    const db = pool.pool;
    console.log(`[DB] 连接已分配 (使用中: ${db._acquiringConnections.length + db._allConnections.length - db._freeConnections.length}, 空闲: ${db._freeConnections.length}, 总数: ${db._allConnections.length})`);
  }
});

// 连接释放回池时触发
pool.on('release', (connection) => {
  // 静默释放，仅在开发环境输出
});

// 新连接创建时触发
pool.on('connection', (connection) => {
  if (process.env.NODE_ENV !== 'production') {
    console.log('[DB] 新连接已建立');
  }
});

// 连接池出现错误时触发
pool.on('error', (err) => {
  console.error('[DB] 连接池错误:', err.message);
  poolHealthy = false;
});

/**
 * 测试数据库连接
 * @param {Object} options - 可选配置
 * @param {boolean} options.silent - 静默模式（不输出日志）
 * @returns {Promise<{success: boolean, error?: string, latency?: number}>}
 */
async function testConnection(options = {}) {
  const now = Date.now();

  // 如果30秒内检查过且健康，跳过重复检查
  if (poolHealthy && (now - lastHealthCheck) < HEALTH_CHECK_INTERVAL) {
    return { success: true, latency: 0 };
  }

  lastHealthCheck = now;

  try {
    const startTime = Date.now();
    const connection = await pool.getConnection();
    const latency = Date.now() - startTime;

    // 执行简单查询验证连接可用性
    await connection.ping();
    connection.release();

    poolHealthy = true;
    if (!options.silent) {
      console.log(`[DB] 连接测试成功 (延迟: ${latency}ms)`);
    }
    return { success: true, latency };
  } catch (error) {
    poolHealthy = false;
    const errMsg = error.code ? `${error.code}: ${error.message}` : error.message;

    if (!options.silent) {
      console.error(`[DB] 连接测试失败: ${errMsg}`);
    }

    // 根据错误码给出诊断建议
    const diagnosis = diagnoseError(error);

    return {
      success: false,
      error: errMsg,
      code: error.code,
      diagnosis
    };
  }
}

/**
 * 诊断数据库连接错误
 * @param {Error} error - 错误对象
 * @returns {string} - 诊断建议
 */
function diagnoseError(error) {
  switch (error.code) {
    case 'ECONNREFUSED':
      return 'MySQL服务未启动或端口不正确。请执行: systemctl status mysqld';
    case 'ETIMEDOUT':
    case 'ENOTFOUND':
      return '无法连接到MySQL服务器。请检查: 1) 安全组是否开放3306端口 2) DB_HOST配置是否正确 3) 防火墙规则';
    case 'ER_ACCESS_DENIED_ERROR':
      return 'MySQL用户名或密码错误。请检查 .env 中的 DB_USER 和 DB_PASSWORD';
    case 'ER_BAD_DB_ERROR':
      return '数据库不存在。请执行: CREATE DATABASE yujian CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci';
    case 'ER_CON_COUNT_ERROR':
      return 'MySQL连接数已满。请增加 max_connections 或检查连接泄漏';
    case 'PROTOCOL_CONNECTION_LOST':
      return 'MySQL连接丢失（可能因 wait_timeout 或网络问题）。已启用 keep-alive 缓解';
    default:
      return error.message.includes('timeout')
        ? '数据库连接超时。请检查: 1) MySQL服务状态 2) 网络延迟 3) 防火墙规则'
        : '未知数据库错误，请查看上方错误信息';
  }
}

/**
 * 获取连接池状态
 * @returns {Object} - 连接池统计信息
 */
function getPoolStatus() {
  const db = pool.pool;
  const total = db._allConnections.length;
  const free = db._freeConnections.length;
  const used = total - free;

  return {
    healthy: poolHealthy,
    totalConnections: total,
    activeConnections: used,
    idleConnections: free,
    connectionLimit: db.config.connectionLimit,
    lastHealthCheck: new Date(lastHealthCheck).toISOString()
  };
}

module.exports = {
  pool,
  testConnection,
  getPoolStatus,
  diagnoseError
};