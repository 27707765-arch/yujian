#!/bin/bash

# 文件名：deploy.sh
# 用途：部署/更新脚本
# 用法：
#   ./deploy.sh              # 默认使用 sandbox 模式（内测推荐）
#   ./deploy.sh production   # 使用 production 模式（正式上线）
#   ./deploy.sh development  # 使用 development 模式
#   ./deploy.sh diagnose     # 仅运行诊断

set -e

# 进入项目目录
cd "$(dirname "$0")"

# 部署模式：sandbox / production / development
ENV_MODE=${1:-sandbox}

echo "=========================================="
echo "  遇见后端服务 - 部署脚本 v2.0"
echo "  模式: ${ENV_MODE}"
echo "  $(date '+%Y-%m-%d %H:%M:%S')"
echo "=========================================="

# 如果是诊断模式
if [ "$ENV_MODE" = "diagnose" ]; then
  echo ""
  if [ -f ./diagnose.sh ]; then
    bash ./diagnose.sh
  else
    echo "诊断脚本不存在，请先部署"
  fi
  exit 0
fi

# 安装依赖
echo ""
echo "📦 安装依赖..."
npm install --production

# 停止旧服务
echo "🛑 停止旧服务..."
pm2 stop yujian-backend 2>/dev/null || true
pm2 delete yujian-backend 2>/dev/null || true

# 清理旧进程（确保端口释放）
echo "🧹 清理残留进程..."
pkill -f "node server.js" 2>/dev/null || true
sleep 1

# 启动新服务
echo "🚀 启动新服务..."
pm2 start ecosystem.config.js --env "${ENV_MODE}"

# 保存 PM2 进程列表
pm2 save

# 查看服务状态
echo ""
echo "📊 服务状态:"
pm2 status

# 健康检查（最多重试3次，每次等3秒）
echo ""
echo "🏥 健康检查..."
HEALTH_OK=false
for i in 1 2 3; do
  if curl -sf --connect-timeout 5 http://127.0.0.1:3000/health > /dev/null 2>&1; then
    echo "✅ 服务运行正常（第${i}次检查）"
    HEALTH_RESP=$(curl -s --connect-timeout 5 http://127.0.0.1:3000/health 2>/dev/null)
    echo "$HEALTH_RESP" | python3 -m json.tool 2>/dev/null || echo "$HEALTH_RESP"
    HEALTH_OK=true
    break
  else
    echo "⏳ 等待服务就绪...（${i}/3）"
    sleep 3
  fi
done

if [ "$HEALTH_OK" = false ]; then
  echo "⚠️  健康检查未通过，请查看日志: pm2 logs yujian-backend --lines 30"
  echo "🔍 运行诊断: bash diagnose.sh"
fi

echo ""
echo "=========================================="
echo "  部署完成！"
echo "  健康检查: http://localhost:3000/health"
echo "  查看日志: pm2 logs yujian-backend"
echo "  运行诊断: bash diagnose.sh"
echo "=========================================="
