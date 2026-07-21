# 遇见APP (yujian) 项目开发指南

## 项目概述
同城社交APP后端，Express.js + MySQL + Redis + WebSocket架构。
ECS: 182.92.179.97 | GitHub: 27707765-arch/yujian

## 架构模式
- **路由 → 中间件(auth/contentAudit) → 控制器 → 模型(DB优先→内存降级) → JSON响应 {code, message, data}**
- 所有模型使用 `src/utils/database.js` 的 `pool.query()` (非pool.execute，mysql2 3.x兼容)
- WebSocket: `ws` 库，`websocket-server.js` 消息switch分支，JWT URL参数认证
- 上传: `multer`，图片≤10MB，视频≤50MB，语音≤15MB

## 部署流程
1. 本地修改文件
2. `scp -i "E:/阿里云/阿里云密钥/yujian.pem" <files> root@182.92.179.97:/home/app/yujian/<path>`
3. `ssh -i key root@182.92.179.97 "pm2 restart yujian-backend"`
4. `ssh -i key root@182.92.179.97 "cd /home/app/yujian && node test-api.js"` 验证23项

## Git推送
```bash
git remote set-url origin https://27707765-arch:<token>@github.com/27707765-arch/yujian.git
git push origin main
git remote set-url origin git@github.com:27707765-arch/yujian.git
```

## 数据库
MySQL: yujian@Yujian@2024DB | Redis: YujianRedis2024
ECS MySQL直接连接: `mysql -u yujian -p'Yujian@2024DB' yujian`

## 关键技术决策
- pool.query() 替代 pool.execute() (mysql2 3.19 兼容性)
- 消息type: 0文字/1图片/2语音/3视频/4贴纸/5位置/6礼物/99系统
- 亲密度: 聊天+1, 每日首聊+5, 语音+2/min, 视频+3/min, 送礼+1~10
- 每日配额: 免费20次like/5次super-like, VIP无限
- 撤销: Redis 3秒TTL
- enableHighAccuracy: true (前端定位)
