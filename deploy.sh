#!/bin/bash

# 文件名：deploy.sh
# 用途：部署脚本

# 进入项目目录
cd "$(dirname "$0")"

echo "开始部署遇见后端服务..."

# 安装依赖
echo "安装依赖..."
npm install

# 构建应用
echo "构建应用..."
# 这里可以添加构建步骤，例如编译TypeScript等

# 停止旧服务
echo "停止旧服务..."
pm2 stop yujian-backend || true

# 启动新服务
echo "启动新服务..."
pm2 start ecosystem.config.js --env production

# 查看服务状态
echo "查看服务状态..."
pm2 status

echo "部署完成！"
