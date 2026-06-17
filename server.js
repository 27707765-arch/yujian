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

// 配置日志
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' })
  ]
});

// 非生产环境下添加控制台日志（生产环境仅记录到文件）
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      winston.format.printf(({ timestamp, level, message }) => `${timestamp} [${level}]: ${message}`)
    )
  }));
}

// 中间件配置
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
})); // 安全头部
app.use(cors({
  origin: process.env.NODE_ENV === 'development'
    ? ['http://localhost:3000', 'http://127.0.0.1:3000']
    : process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : ['http://localhost:3000'],
  credentials: true
})); // 跨域支持（白名单模式）
app.use(express.json()); // JSON 解析
app.use(express.urlencoded({ extended: true })); // URL 编码解析
app.use(express.static('public')); // 前端页面服务
app.use(express.static('uploads')); // 静态文件服务

// 请求日志中间件（使用 Winston 记录到文件，同时输出到控制台）
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

  // 响应完成后记录耗时
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    console.log(`${new Date().toISOString()} ${req.method} ${req.url} ${res.statusCode} ${duration}ms`);
  });

  next();
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

// 认证路由 - 添加内容审核 + 短信限流
const smsRateLimit = rateLimit({
  windowMs: process.env.NODE_ENV === 'production' ? 60000 : 10000, // 生产1分钟，开发10秒
  max: process.env.NODE_ENV === 'production' ? 1 : 10, // 生产1次，开发10次
  message: '验证码发送过于频繁，请稍后再试',
  keyPrefix: 'rate_limit_sms'
});
app.use('/api/auth/send-code', smsRateLimit);
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

// 管理后台路由（需管理员权限）
app.use('/api/admin', adminRoutes);

// 健康检查接口
app.get('/health', (req, res) => {
  res.status(200).json({
    code: 0,
    message: 'success',
    data: {
      status: 'ok',
      timestamp: new Date().toISOString()
    }
  });
});

// 根路径返回前端页面
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
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

    // 启动WebSocket服务器
    const { startWebSocketServer } = require('./websocket-server');
    startWebSocketServer(server);

    // 启动HTTP服务器
    server.listen(PORT, () => {
      logger.info(`服务器运行在 http://localhost:${PORT}`);
      console.log(`服务器运行在 http://localhost:${PORT}`);
      console.log(`健康检查接口: http://localhost:${PORT}/health`);
      console.log('WebSocket服务器已就绪');
    });
  } catch (error) {
    logger.error('服务器启动失败:', error);
    process.exit(1);
  }
}

startServer();

module.exports = app;