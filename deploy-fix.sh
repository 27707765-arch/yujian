#!/bin/bash
# 文件名：deploy-fix.sh
# 用途：部署修复脚本到服务器
# 使用方式：在本地执行此脚本

echo "🔧 开始部署消息和推荐功能修复..."

# 配置
SERVER="root@182.92.179.97"
KEY="E:/阿里云/阿里云密钥/yujian.pem"
REMOTE_DIR="/home/app/yujian"

# 1. 上传修复脚本
echo "📤 上传修复脚本..."
scp -i "$KEY" fix_all_issues.sql $SERVER:$REMOTE_DIR/
scp -i "$KEY" src/models/User.js $SERVER:$REMOTE_DIR/src/models/
scp -i "$KEY" src/services/offlineMessage.service.js $SERVER:$REMOTE_DIR/src/services/
scp -i "$KEY" websocket-server.js $SERVER:$REMOTE_DIR/

# 2. 执行数据库修复
echo "🗄️  执行数据库修复..."
ssh -i "$KEY" $SERVER "cd $REMOTE_DIR && mysql -u yujian -p'Yujian@2024DB' yujian < fix_all_issues.sql"

# 3. 重启服务
echo "🔄 重启服务..."
ssh -i "$KEY" $SERVER "pm2 restart yujian-backend"

# 4. 等待服务启动
echo "⏳ 等待服务启动..."
sleep 3

# 5. 验证修复
echo "✅ 验证修复..."
ssh -i "$KEY" $SERVER "cd $REMOTE_DIR && node test-fix-verify.js"

echo "🎉 部署完成！"
