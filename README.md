# 遇见（同城社交 APP 后端）

## 项目描述
开发一款轻量级同城情感社交 APP 后端系统，支持用户注册登录、同城匹配、实时聊天、内容审核等核心功能。

## 技术栈
- Node.js 18+
- Express 4.x
- MySQL 8.0
- Redis 7.0
- WebSocket (ws 库)
- JWT (jsonwebtoken)
- bcryptjs

## 目录结构
```
├── src/
│   ├── controllers/     # 控制器
│   ├── routes/          # 路由
│   ├── middleware/      # 中间件
│   ├── services/        # 服务
│   ├── models/          # 模型
│   ├── config/          # 配置
├── uploads/             # 上传文件
├── logs/                # 日志
├── server.js            # 应用入口
├── package.json         # 依赖配置
├── .env.example         # 环境变量示例
├── .gitignore           # Git 忽略文件
└── README.md            # 项目说明
```

## 环境要求
- Node.js 18+
- MySQL 8.0+
- Redis 7.0+

## 安装与运行
1. 克隆项目
2. 安装依赖：`npm install`
3. 复制环境变量文件：`cp .env.example .env`
4. 配置环境变量
5. 启动开发服务器：`npm run dev`
6. 启动生产服务器：`npm start`

## 核心功能
- 用户系统：手机号 + 验证码登录、个人资料管理、头像上传
- 匹配系统：同城推荐、喜欢/跳过、匹配成功通知
- 聊天系统：WebSocket 实时通信、文字/图片消息、消息持久化
- 基础安全：JWT 认证、敏感词过滤、限流防护

## API 接口
- 健康检查：`GET /health`

## 开发规范
- 所有代码使用中文注释
- 每个函数必须有 JSDoc 注释
- 遵循 RESTful API 设计规范
- 使用 async/await，避免回调地狱
- 统一使用 UTF-8 编码

## 错误处理
- 所有 API 必须有 try-catch
- 统一错误响应格式：{ code, message, data }
- 错误码规范：
  - 0: 成功
  - 400: 请求参数错误
  - 401: 未授权/Token 无效
  - 403: 禁止访问
  - 404: 资源不存在
  - 429: 请求过于频繁
  - 500: 服务器内部错误