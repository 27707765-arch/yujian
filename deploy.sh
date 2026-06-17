#!/bin/bash

# 文件名：deploy.sh
# 用途：部署脚本
# 用法：
#   ./deploy.sh            # 默认使用 sandbox 模式（内测推荐）
#   ./deploy.sh production  # 使用 production 模式（正式上线）
#   ./deploy.sh development # 使用 development 模式

set -e

# 进入项目目录
cd "$(dirname "$0")"

# 部署模式：sandbox / production / development
ENV_MODE=${1:-sandbox}

echo "=========================================="
echo "  遇见后端服务 - 部署脚本"
echo "  模式: ${ENV_MODE}"
echo "=========================================="

# 安装依赖
echo "📦 安装依赖..."
npm install --production

# 停止旧服务
echo "🛑 停止旧服务..."
pm2 stop yujian-backend 2>/dev/null || true
pm2 delete yujian-backend 2>/dev/null || true

# 启动新服务
echo "🚀 启动新服务..."
pm2 start ecosystem.config.js --env "${ENV_MODE}"

# 保存 PM2 进程列表
pm2 save

# 查看服务状态
echo ""
echo "📊 服务状态:"
pm2 status

# 健康检查
sleep 3
echo ""
echo "🏥 健康检查..."
if curl -sf http://127.0.0.1:3000/health > /dev/null 2>&1; then
  echo "✅ 服务运行正常"
else
  echo "⚠️  健康检查未通过，请查看日志: pm2 logs yujian-backend"
fi

echo ""
echo "=========================================="
echo "  部署完成！"
echo "  健康检查: http://localhost:3000/health"
echo "  查看日志: pm2 logs yujian-backend"
echo "=========================================="
