# 遇见APP (yujian) 项目开发指南

## 项目概述
同城社交APP后端，Express.js + MySQL + Redis + WebSocket架构。
ECS: 182.92.179.97 | GitHub: 27707765-arch/yujian

## ⚠️ 凭据管理原则（必须遵守）
- **数据库/Redis/JWT/短信等真实配置只存两份**：本地 `.env` + ECS 服务器的 `.env`，**永不提交到 git**。
- 仓库内只允许 `.env.example` 与 `.env.production`（均为**占位符模板**，值为 `请修改为...`/`your_xxx`）。任何真实凭据不得入库。
- SSH 私钥存 `E:/阿里云/阿里云密钥/`（仓库之外），部署时用环境变量 `YUJIAN_SSH_KEY` 引用。
- 仓库为 **public**，任何入库的凭据视为已泄露，必须立即轮换。

## 架构模式
- **路由 → 中间件(auth/contentAudit) → 控制器 → 模型(DB优先→内存降级) → JSON响应 {code, message, data}**
- 所有模型使用 `src/utils/database.js` 的 `pool.query()` (非pool.execute，mysql2 3.x兼容)
- WebSocket: `ws` 库，`websocket-server.js` 消息switch分支，JWT URL参数认证
- 上传: `multer`，图片≤10MB，视频≤50MB，语音≤15MB

## 部署流程
1. 本地修改文件
2. `scp -i "$YUJIAN_SSH_KEY" <files> root@182.92.179.97:/home/app/yujian/<path>`（`$YUJIAN_SSH_KEY` 为本地环境变量，指向 `E:/阿里云/阿里云密钥/yujian2.pem`）
3. `ssh -i "$YUJIAN_SSH_KEY" root@182.92.179.97 "pm2 restart yujian-backend"`
4. `ssh -i "$YUJIAN_SSH_KEY" root@182.92.179.97 "cd /home/app/yujian && node test-api.js"` 验证23项

> ⚠️ 凭据管理：SSH 私钥、MySQL/Redis 密码一律从本地环境变量或 `.env`（被 gitignore）读取，**严禁写入仓库**。仓库为 public，任何入库的凭据视为已泄露。

## Git推送
```bash
git push origin main
```
> 注意：仓库为 public。若需推送到私有仓库请先在 GitHub 设置改为 Private。不要在命令行/脚本中明文拼接 token。

## 数据库
- MySQL 与 Redis 连接信息均配置在 `.env`（本地）与 ECS 生产环境变量中，不在仓库保存。
- ECS 直连请使用 SSH 会话内读取 `.env`，或本地 `MYSQL_PWD` 环境变量。

## 关键技术决策
- pool.query() 替代 pool.execute() (mysql2 3.19 兼容性)
- 消息type: 0文字/1图片/2语音/3视频/4贴纸/5位置/6礼物/99系统
- 亲密度: 聊天+1, 每日首聊+5, 语音+2/min, 视频+3/min, 送礼+1~10
- 每日配额: 免费20次like/5次super-like, VIP无限
- 撤销: Redis 3秒TTL
- enableHighAccuracy: true (前端定位)
