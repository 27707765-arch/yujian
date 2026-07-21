// 文件名：server.js
// 用途：Express 应用入口文件

const express = require('express');
const dotenv = require('dotenv');
const helmet = require('helmet');
const cors = require('cors');
const winston = require('winston');
const path = require('path');

// 加载环境变量
dotenv.config();

// 创建 Express 应用
const app = express();
const PORT = process.env.PORT || 3000;

// ==================== 日志配置 ====================
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error', maxsize: 10 * 1024 * 1024, maxFiles: 5 }),
    new winston.transports.File({ filename: 'logs/combined.log', maxsize: 10 * 1024 * 1024, maxFiles: 5 })
  ]
});

// 生产环境也添加控制台输出（方便SSH排查），但仅输出 warn 以上级别
if (process.env.NODE_ENV === 'production') {
  logger.add(new winston.transports.Console({
    level: 'warn',
    format: winston.format.combine(
      winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      winston.format.printf(({ timestamp, level, message }) => `${timestamp} [${level}]: ${message}`)
    )
  }));
} else {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      winston.format.printf(({ timestamp, level, message }) => `${timestamp} [${level}]: ${message}`)
    )
  }));
}

// ==================== 全局超时配置 ====================
// 防止慢请求/网络抖动导致连接堆积
const REQUEST_TIMEOUT_MS = parseInt(process.env.REQUEST_TIMEOUT_MS, 10) || 30000; // 默认30秒

app.use((req, res, next) => {
  // 设置请求超时（Node.js 原生支持）
  req.setTimeout(REQUEST_TIMEOUT_MS, () => {
    if (!res.headersSent) {
      res.status(408).json({
        code: 408,
        message: '请求超时，请稍后重试',
        data: null
      });
    }
    // 注意：setTimeout 不会自动终止请求处理，仅发送响应
    // 对于已超时的请求，后续中间件仍可能执行，需要在控制器中使用 req.aborted 判断
  });
  next();
});

// ==================== 中间件配置 ====================

// 安全头部（开发模式/沙箱测试放宽松，严格生产模式启用CSP）
if (process.env.NODE_ENV === 'production' && !process.env.SMS_SIMULATE) {
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'http:'],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameSrc: ["'none'"]
      }
    }
  }));
} else {
  // 开发/沙箱模式：完全禁用 Helmet 安全头（iOS Safari 对某些头极度敏感）
  // 注意：仅在测试环境使用，生产环境务必启用完整安全头
}

app.use(cors({
  origin: process.env.NODE_ENV === 'development'
    ? function (origin, callback) {
        // 开发模式下允许所有来源（方便局域网/手机测试）
        // 无 origin 的请求（如 Postman/curl）也放行
        if (!origin) return callback(null, true);
        callback(null, true);
      }
    : process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim()) : ['http://localhost:3000'],
  credentials: true
}));

app.use(express.json({ limit: '10mb' })); // JSON 解析（限制大小防止攻击）
app.use(express.urlencoded({ extended: true, limit: '10mb' })); // URL 编码解析

// 静态文件服务（添加缓存头）
const staticOptions = {
  maxAge: process.env.NODE_ENV === 'production' ? '7d' : 0,  // 生产环境缓存7天
  etag: true,
  lastModified: true,
  setHeaders: (res, filePath) => {
    // HTML文件不缓存（确保获取最新版本）
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
  }
};
app.use(express.static('public', staticOptions));
app.use('/uploads', express.static('uploads', {
  maxAge: '30d',
  etag: true
}));

// 请求日志中间件（Winston 记录到文件，非生产环境额外输出到控制台）
app.use((req, res, next) => {
  const startTime = Date.now();
  const logMessage = `${req.method} ${req.url}`;

  // 记录到 Winston
  logger.info(logMessage, {
    method: req.method,
    url: req.url,
    ip: req.ip,
    userAgent: req.get('user-agent')
  });

  // 响应完成后记录耗时（生产环境仅写日志文件，开发环境同时输出控制台）
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    if (process.env.NODE_ENV !== 'production') {
      console.log(`${new Date().toISOString()} ${req.method} ${req.url} ${res.statusCode} ${duration}ms`);
    }
  });

  next();
});

const uploadService = require('./src/services/upload.service');
const authMiddleware = require('./src/middleware/auth');

// 通用图片上传路由（聊天/动态等共用）
app.post('/api/upload/image', authMiddleware, uploadService.singleUpload('image').bind(uploadService), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ code: 400, message: '请选择图片文件' });
  }
  const url = '/' + req.file.filename;
  res.json({ code: 0, message: '上传成功', data: { url, filename: req.file.filename } });
});

// 注册路由
const authRoutes = require('./src/routes/auth.routes');
const userRoutes = require('./src/routes/user.routes');
const matchRoutes = require('./src/routes/match.routes');
const chatRoutes = require('./src/routes/chat.routes');
const reportRoutes = require('./src/routes/report.routes');
const postRoutes = require('./src/routes/post.routes');
const orderRoutes = require('./src/routes/order.routes');
const blockRoutes = require('./src/routes/block.routes');
const pushRoutes = require('./src/routes/push.routes');
const giftRoutes = require('./src/routes/gift.routes');
const walletRoutes = require('./src/routes/wallet.routes');
const checkinRoutes = require('./src/routes/checkin.routes');
const verificationRoutes = require('./src/routes/verification.routes');
const callRoutes = require('./src/routes/call.routes');
const feedbackController = require('./src/controllers/feedback.controller');
const adminRoutes = require('./src/routes/admin.routes');

// 导入中间件
const { rateLimit } = require('./src/middleware/rateLimit');
const contentAudit = require('./src/middleware/contentAudit');

// 全局限流
app.use(rateLimit({
  windowMs: 900000, // 15分钟
  max: 100, // 每个IP最多100次请求
  message: '请求过于频繁，请稍后再试',
  keyPrefix: 'rate_limit_global'
}));

// 认证路由 - 登录限流（防止暴力破解验证码）
const authRateLimit = rateLimit({
  windowMs: 60000,    // 1分钟窗口
  max: 5,             // 最多5次登录尝试
  message: '登录尝试过于频繁，请1分钟后再试',
  keyPrefix: 'rate_limit_login'
});
app.use('/api/auth/login', authRateLimit);

// 短信验证码限流（模拟模式/非生产环境不限制）
const isSmsSimulate = process.env.SMS_SIMULATE === 'true' || process.env.NODE_ENV !== 'production';
if (!isSmsSimulate) {
  const smsRateLimit = rateLimit({
    windowMs: 60000,
    max: 1,
    message: '验证码发送过于频繁，请稍后再试',
    keyPrefix: 'rate_limit_sms'
  });
  app.use('/api/auth/send-code', smsRateLimit);
}
app.use('/api/auth', contentAudit({ fields: ['nickname'] }), authRoutes);

// 用户路由 - 添加内容审核
app.use('/api/user', contentAudit({ fields: ['nickname', 'bio'] }), userRoutes);

// 匹配路由
app.use('/api/match', matchRoutes);

// 聊天路由 - 添加内容审核
app.use('/api/chat', contentAudit({ fields: ['content'] }), chatRoutes);

// 举报路由
app.use('/api/report', reportRoutes);

// 动态路由（内容审核在路由内部 multer 之后执行）
app.use('/api/posts', postRoutes);

// 订单/支付路由
app.use('/api/orders', orderRoutes);

// 拉黑路由
app.use('/api/block', blockRoutes);

// 推送路由
app.use('/api/push', pushRoutes);

// 礼物路由
app.use('/api/gifts', giftRoutes);

// 钱包路由
app.use('/api/wallet', walletRoutes);

// 签到与任务路由
app.use('/api/checkin', checkinRoutes);

// 认证路由（实名/人脸/学历/车辆认证）
app.use('/api/verification', verificationRoutes);

// 通话路由（语音/视频通话）
app.use('/api/call', callRoutes);

// 管理后台路由（需管理员权限）
app.post('/api/feedback', authMiddleware, feedbackController.submitFeedback);
app.use('/api/admin', adminRoutes);

// 健康检查接口（增强版：检查DB和Redis连接状态）
app.get('/health', async (req, res) => {
  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage().rss / 1024 / 1024, // MB
    services: {
      http: { status: 'ok' },
      db: { status: 'unknown' },
      redis: { status: 'unknown' }
    }
  };

  try {
    // 并行检查数据库和Redis
    const { testConnection: testDb } = require('./src/config/database');
    const { testConnection: testRedis } = require('./src/config/redis');

    const [dbResult, redisResult] = await Promise.allSettled([
      testDb({ silent: true }),
      testRedis({ silent: true })
    ]);

    if (dbResult.status === 'fulfilled' && dbResult.value) {
      health.services.db = {
        status: dbResult.value.success ? 'ok' : 'error',
        latency: dbResult.value.latency || 0,
        error: dbResult.value.error || null
      };
    } else {
      health.services.db = { status: 'error', error: '检查超时' };
    }

    if (redisResult.status === 'fulfilled' && redisResult.value) {
      health.services.redis = {
        status: redisResult.value.success ? 'ok' : 'error',
        latency: redisResult.value.latency || 0,
        error: redisResult.value.error || null
      };
    } else {
      health.services.redis = { status: 'error', error: '检查超时' };
    }

    // 综合判断：任一核心服务失败则整体状态降级
    const dbOk = health.services.db.status === 'ok';
    const redisOk = health.services.redis.status === 'ok';

    if (!dbOk && !redisOk) {
      health.status = 'critical';  // 两个都挂了
    } else if (!dbOk || !redisOk) {
      health.status = 'degraded';  // 一个挂了（仍可降级运行）
    }
  } catch (err) {
    health.status = 'error';
    health.error = err.message;
  }

  const httpStatus = health.status === 'ok' ? 200
    : health.status === 'degraded' ? 200  // 降级仍返回200（服务可用）
    : 503;  // 两个服务都挂返回503

  res.status(httpStatus).json({
    code: 0,
    message: health.status === 'ok' ? '服务正常' : `服务${health.status === 'degraded' ? '降级运行' : '异常'}`,
    data: health
  });
});

// 根路径返回前端页面（Vue版本）
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index-vue.html'));
});

// 管理后台页面
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// 404 处理
app.use((req, res) => {
  res.status(404).json({
    code: 404,
    message: '接口不存在',
    data: null
  });
});

// 错误处理中间件
app.use((err, req, res, next) => {
  logger.error('服务器错误:', err);
  res.status(500).json({
    code: 500,
    message: '服务器内部错误',
    data: null
  });
});

// 启动服务器
async function startServer() {
  try {
    // 安全检查：生产环境使用弱密钥时拒绝启动
    if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'your_jwt_secret_key') {
      if (process.env.NODE_ENV === 'production') {
        console.error('❌ 生产环境必须设置 JWT_SECRET，请在 .env 中配置安全的密钥');
        process.exit(1);
      }
      console.warn('⚠️  警告: JWT_SECRET 使用默认值，生产环境请务必修改 .env 中的 JWT_SECRET');
    }
    if (!process.env.DB_PASSWORD || process.env.DB_PASSWORD === '123456') {
      if (process.env.NODE_ENV === 'production') {
        console.error('❌ 生产环境必须设置 DB_PASSWORD，请在 .env 中配置安全的数据库密码');
        process.exit(1);
      }
      console.warn('⚠️  警告: DB_PASSWORD 使用默认值，生产环境请务必修改 .env 中的 DB_PASSWORD');
    }
    console.log('正在启动服务器...');

    // 创建HTTP服务器
    const http = require('http');
    const server = http.createServer(app);

    // ==================== 服务器超时配置 ====================
    // headersTimeout: 等待完整HTTP头的超时（防止慢速攻击）
    // keepAliveTimeout: Keep-Alive连接超时（需大于 headersTimeout）
    server.headersTimeout = parseInt(process.env.SERVER_HEADERS_TIMEOUT, 10) || 65000; // 65秒
    server.keepAliveTimeout = parseInt(process.env.SERVER_KEEPALIVE_TIMEOUT, 10) || 70000; // 70秒
    server.requestTimeout = parseInt(process.env.REQUEST_TIMEOUT_MS, 10) || 30000; // 30秒

    // 启动WebSocket服务器
    const { startWebSocketServer } = require('./websocket-server');
    const wssInstance = startWebSocketServer(server);

    // 启动HTTP服务器
    server.listen(PORT, () => {
      logger.info(`服务器运行在 http://localhost:${PORT}`);
      console.log(`✅ 服务器运行在 http://localhost:${PORT}`);
      console.log(`🏥 健康检查接口: http://localhost:${PORT}/health`);
      console.log(`🔌 WebSocket服务器已就绪`);
      console.log(`⏱️  请求超时: ${server.requestTimeout / 1000}s`);
      console.log(`🌍 环境: ${process.env.NODE_ENV || 'development'}`);
    });

    // ==================== 优雅关闭 ====================
    let isShuttingDown = false;

    async function gracefulShutdown(signal) {
      if (isShuttingDown) return;
      isShuttingDown = true;

      console.log(`\n🛑 收到 ${signal} 信号，正在优雅关闭...`);

      // 30秒后强制退出
      const forceExitTimer = setTimeout(() => {
        console.error('⚠️  强制退出（超时）');
        process.exit(1);
      }, 30000);

      try {
        // 1. 关闭WebSocket服务器（先断客户端）
        if (wssInstance) {
          wssInstance.clients.forEach((ws) => {
            ws.close(1001, '服务器正在关闭');
          });
          // 等待最多5秒让关闭完成
          await new Promise(resolve => {
            const timer = setTimeout(resolve, 5000);
            wssInstance.close(() => {
              clearTimeout(timer);
              console.log('✅ WebSocket服务器已关闭');
              resolve();
            });
          });
        }

        // 2. 停止接收新HTTP连接
        server.close(() => {
          console.log('✅ HTTP服务器已关闭');
        });

        // 3. 关闭数据库连接池
        const { pool } = require('./src/config/database');
        await pool.end();
        console.log('✅ 数据库连接池已关闭');

        // 4. 关闭Redis连接
        try {
          const { getClient } = require('./src/config/redis');
          const redisClient = getClient();
          if (redisClient && redisClient.isOpen) {
            await redisClient.quit();
            console.log('✅ Redis连接已关闭');
          }
        } catch (redisErr) {
          // Redis关闭失败不阻止退出
        }

        clearTimeout(forceExitTimer);
        console.log('👋 服务已安全关闭');
        process.exit(0);
      } catch (err) {
        console.error('❌ 关闭过程中出错:', err);
        clearTimeout(forceExitTimer);
        process.exit(1);
      }
    }

    // 监听退出信号
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    return server;
  } catch (error) {
    logger.error('服务器启动失败:', error);
    process.exit(1);
  }
}

// ==================== 全局未捕获异常处理 ====================
// 防止未处理的错误导致进程崩溃

process.on('uncaughtException', (err) => {
  // 记录但不退出（常见于异步操作中的非关键错误）
  logger.error('未捕获异常:', {
    message: err.message,
    stack: err.stack,
    type: 'uncaughtException'
  });
  console.error(`❌ 未捕获异常: ${err.message}`);

  // 对于致命错误（如端口占用），退出进程让PM2重启
  if (err.code === 'EADDRINUSE') {
    console.error('❌ 端口已被占用，进程退出');
    process.exit(1);
  }
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('未处理的Promise拒绝:', {
    message: reason?.message || reason,
    stack: reason?.stack,
    type: 'unhandledRejection'
  });
  console.error(`❌ 未处理的Promise拒绝: ${reason?.message || reason}`);
  // 不退出进程，但记录日志供排查
});

// 进程即将退出时的清理
process.on('beforeExit', (code) => {
  console.log(`进程即将退出 (code: ${code})`);
});

startServer();

module.exports = app;