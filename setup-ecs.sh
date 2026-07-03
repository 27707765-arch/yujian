#!/bin/bash
# ==========================================
# 遇见APP ECS一键部署脚本 v2.0
# 用法: chmod +x setup-ecs.sh && ./setup-ecs.sh
# 适用: 阿里云ECS CentOS 7/8 或 Alibaba Cloud Linux 3
# ==========================================
set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log()  { echo -e "${GREEN}[INFO]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
err()  { echo -e "${RED}[ERROR]${NC} $1"; }
step() { echo -e "\n${BLUE}=========================================="
         echo "  $1"
         echo -e "==========================================${NC}"; }

# 检查是否为root
if [ "$EUID" -ne 0 ]; then
  err "请使用root用户运行: sudo ./setup-ecs.sh"
  exit 1
fi

# 切换到项目目录
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# =============================================
step "Step 1/9: 系统检测与更新"
# =============================================

# 检测操作系统
if [ -f /etc/os-release ]; then
  . /etc/os-release
  OS_NAME="$ID"
  OS_VERSION="$VERSION_ID"
  log "检测到操作系统: $OS_NAME $OS_VERSION"
else
  err "无法检测操作系统类型"
  exit 1
fi

# 检查内存（至少1GB）
TOTAL_MEM=$(free -m | awk '/^Mem:/{print $2}')
if [ "$TOTAL_MEM" -lt 900 ]; then
  warn "内存不足1GB (${TOTAL_MEM}MB)，MySQL+Redis+Node.js可能不稳定"
  warn "建议至少2GB内存用于生产环境"
fi

# 检查磁盘空间（至少10GB可用）
AVAIL_DISK=$(df -BG / | awk 'NR==2 {print $4}' | sed 's/G//')
if [ "$AVAIL_DISK" -lt 10 ]; then
  warn "可用磁盘空间不足10GB (${AVAIL_DISK}GB)"
fi

log "系统更新中..."
yum update -y -q 2>/dev/null || true

# =============================================
step "Step 2/9: 安装 Node.js 18"
# =============================================

if command -v node &>/dev/null; then
  NODE_VER=$(node -v)
  log "Node.js 已安装: $NODE_VER"
else
  log "安装 Node.js 18..."
  curl -fsSL https://rpm.nodesource.com/setup_18.x | bash -
  yum install -y nodejs
  log "Node.js $(node -v) 安装完成"
fi

# =============================================
step "Step 3/9: 安装 PM2"
# =============================================

if command -v pm2 &>/dev/null; then
  log "PM2 已安装: $(pm2 -v)"
else
  log "安装 PM2..."
  npm install -g pm2
  log "PM2 安装完成"
fi

# =============================================
step "Step 4/9: 安装 Nginx"
# =============================================

if command -v nginx &>/dev/null; then
  log "Nginx 已安装: $(nginx -v 2>&1)"
else
  log "安装 Nginx..."
  yum install -y nginx
  systemctl enable nginx
  log "Nginx 安装完成"
fi

# =============================================
step "Step 5/9: 安装 MySQL 8.0"
# =============================================

# 生成随机密码（兼容不同系统）
generate_password() {
  # 使用多种方法兜底生成随机密码
  if command -v openssl &>/dev/null; then
    openssl rand -hex 8 2>/dev/null
  elif command -v date &>/dev/null && command -v md5sum &>/dev/null; then
    date +%s | md5sum | head -c 16
  elif command -v python3 &>/dev/null; then
    python3 -c "import secrets; print(secrets.token_hex(8))"
  else
    # 终极兜底
    cat /dev/urandom | tr -dc 'a-zA-Z0-9' | head -c 16
  fi
}

MYSQL_PWD=$(generate_password)
log "生成的MySQL密码: ${MYSQL_PWD}"

if command -v mysql &>/dev/null; then
  log "MySQL 已安装"
else
  log "安装 MySQL 8.0..."
  yum install -y mysql-community-server 2>/dev/null || yum install -y mysql-server 2>/dev/null || {
    # 如果上面失败，尝试从官方源安装
    rpm -Uvh https://dev.mysql.com/get/mysql80-community-release-el7-3.noarch.rpm 2>/dev/null || true
    yum install -y mysql-community-server
  }
fi

systemctl enable mysqld 2>/dev/null || true
systemctl start mysqld 2>/dev/null || {
  err "MySQL 启动失败，请检查: systemctl status mysqld"
  err "跳过数据库初始化，请手动配置"
}

# 尝试获取临时密码并修改
TEMP_PWD=""
if [ -f /var/log/mysqld.log ]; then
  TEMP_PWD=$(grep 'temporary password' /var/log/mysqld.log 2>/dev/null | tail -1 | awk '{print $NF}')
fi

# 配置MySQL数据库
if [ -n "$TEMP_PWD" ]; then
  log "MySQL临时密码: $TEMP_PWD"
  # 使用临时密码登录并修改配置
  mysql --connect-expired-password -uroot -p"${TEMP_PWD}" <<EOSQL 2>/dev/null && {
    log "MySQL 数据库配置成功"
  } || {
    warn "MySQL 自动配置失败，请手动执行以下SQL:"
    cat <<MANUAL
ALTER USER 'root'@'localhost' IDENTIFIED BY '${MYSQL_PWD}';
CREATE DATABASE IF NOT EXISTS yujian CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'yujian'@'127.0.0.1' IDENTIFIED BY '${MYSQL_PWD}';
GRANT ALL PRIVILEGES ON yujian.* TO 'yujian'@'127.0.0.1';
FLUSH PRIVILEGES;
MANUAL
  }
ALTER USER 'root'@'localhost' IDENTIFIED BY '${MYSQL_PWD}';
CREATE DATABASE IF NOT EXISTS yujian CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'yujian'@'127.0.0.1' IDENTIFIED BY '${MYSQL_PWD}';
GRANT ALL PRIVILEGES ON yujian.* TO 'yujian'@'127.0.0.1';
FLUSH PRIVILEGES;
EOSQL
elif mysql -uroot -e "SELECT 1" 2>/dev/null; then
  # 无密码的MySQL（某些版本默认）
  log "MySQL 无密码，正在设置新密码..."
  mysql -uroot <<EOSQL
ALTER USER 'root'@'localhost' IDENTIFIED BY '${MYSQL_PWD}';
CREATE DATABASE IF NOT EXISTS yujian CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'yujian'@'127.0.0.1' IDENTIFIED BY '${MYSQL_PWD}';
GRANT ALL PRIVILEGES ON yujian.* TO 'yujian'@'127.0.0.1';
FLUSH PRIVILEGES;
EOSQL
  log "MySQL密码已设置"
else
  warn "⚠️  无法自动配置MySQL，请手动处理"
fi

# 导入表结构
if [ -f "$SCRIPT_DIR/schema.sql" ]; then
  mysql -uyujian -p"${MYSQL_PWD}" -h127.0.0.1 yujian < "$SCRIPT_DIR/schema.sql" 2>/dev/null && {
    log "数据库表结构导入成功"
  } || {
    warn "⚠️  表结构导入失败，请手动执行: mysql -uyujian -p -h127.0.0.1 yujian < schema.sql"
  }
else
  warn "schema.sql 不存在，跳过表结构导入"
fi

# =============================================
step "Step 6/9: 安装 Redis"
# =============================================

REDIS_PWD=$(generate_password)
log "生成的Redis密码: ${REDIS_PWD}"

if command -v redis-server &>/dev/null || command -v redis-cli &>/dev/null; then
  log "Redis 已安装"
else
  log "安装 Redis..."
  yum install -y redis
fi

# 配置Redis密码
if [ -f /etc/redis.conf ]; then
  # 先检查是否已有密码配置
  if grep -q "^requirepass" /etc/redis.conf 2>/dev/null; then
    # 替换已有密码
    sed -i "s/^requirepass.*/requirepass ${REDIS_PWD}/" /etc/redis.conf
  else
    # 添加新密码配置
    echo "requirepass ${REDIS_PWD}" >> /etc/redis.conf
  fi

  # 安全配置：只监听本地
  sed -i 's/^bind .*/bind 127.0.0.1/' /etc/redis.conf 2>/dev/null || true

  # 内存限制（根据系统内存自适应）
  if [ "$TOTAL_MEM" -lt 2000 ]; then
    # 小内存机器限制为256MB
    grep -q "^maxmemory " /etc/redis.conf 2>/dev/null && \
      sed -i 's/^maxmemory .*/maxmemory 256mb/' /etc/redis.conf || \
      echo "maxmemory 256mb" >> /etc/redis.conf
    echo "maxmemory-policy allkeys-lru" >> /etc/redis.conf
  fi

  log "Redis 密码已配置"
else
  warn "未找到 /etc/redis.conf，请手动配置Redis"
fi

systemctl enable redis 2>/dev/null || true
systemctl start redis 2>/dev/null || true

# 验证Redis
if redis-cli -a "$REDIS_PWD" ping 2>/dev/null | grep -q PONG; then
  log "Redis 服务运行正常"
else
  warn "⚠️  Redis 可能未正确启动，请检查: systemctl status redis"
fi

# =============================================
step "Step 7/9: 部署应用代码"
# =============================================

APP_DIR="/home/app/yujian"
mkdir -p "$APP_DIR/uploads" "$APP_DIR/logs"

# 排除不需要的文件进行复制
log "复制代码到 $APP_DIR ..."
rsync -a --exclude='node_modules' --exclude='.git' --exclude='logs' \
      --exclude='uploads/*' --exclude='*.pem' --exclude='*.tar.gz' \
      "$SCRIPT_DIR/" "$APP_DIR/" 2>/dev/null || {
  # rsync不可用时使用cp兜底
  cp -r "$SCRIPT_DIR"/* "$APP_DIR/" 2>/dev/null || true
}

cd "$APP_DIR"

# 生成JWT密钥
JWT_SECRET=$(generate_password)$(generate_password)  # 64字符超长密钥

# 生成 .env 配置文件
cat > .env <<ENVEOF
PORT=3000
NODE_ENV=production

# 数据库配置
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=yujian
DB_PASSWORD=${MYSQL_PWD}
DB_NAME=yujian
DB_POOL_SIZE=10
DB_CONNECT_TIMEOUT=10000
DB_ACQUIRE_TIMEOUT=15000

# Redis配置
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=${REDIS_PWD}
REDIS_DB=0

# JWT配置
JWT_SECRET=${JWT_SECRET}
JWT_EXPIRES_IN=24h

# 文件上传配置
UPLOAD_DIR=/home/app/yujian/uploads
MAX_UPLOAD_SIZE=10485760

# 请求超时
REQUEST_TIMEOUT_MS=30000
SERVER_HEADERS_TIMEOUT=65000
SERVER_KEEPALIVE_TIMEOUT=70000

# 限流配置
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX=100

# CORS白名单（部署后请改为实际域名）
ALLOWED_ORIGINS=http://localhost:3000

# 礼物分成比例（0.7 = 70%给接收者）
GIFT_SHARE_RATIO=0.7

# 日志级别: error, warn, info, debug
LOG_LEVEL=info
ENVEOF

log ".env 配置文件已生成"

# 安装生产依赖
log "安装npm依赖..."
npm install --production

# 启动应用
log "启动PM2应用..."
pm2 stop yujian-backend 2>/dev/null || true
pm2 delete yujian-backend 2>/dev/null || true
pm2 start ecosystem.config.js --env production
pm2 save
pm2 startup systemd -u root --hp /root 2>/dev/null || true

# =============================================
step "Step 8/9: 配置 Nginx"
# =============================================

# 备份原配置
if [ -f /etc/nginx/nginx.conf ] && [ ! -f /etc/nginx/nginx.conf.bak ]; then
  cp /etc/nginx/nginx.conf /etc/nginx/nginx.conf.bak
  log "已备份原Nginx配置"
fi

cp "$APP_DIR/nginx.conf" /etc/nginx/nginx.conf

# 测试配置
nginx -t 2>&1 && {
  log "Nginx 配置测试通过"
} || {
  err "Nginx 配置有误，已恢复备份"
  cp /etc/nginx/nginx.conf.bak /etc/nginx/nginx.conf 2>/dev/null || true
}

systemctl restart nginx 2>/dev/null || nginx -s reload 2>/dev/null || true

# 开放防火墙端口（firewalld）
if command -v firewall-cmd &>/dev/null; then
  firewall-cmd --add-service=http --permanent 2>/dev/null || true
  firewall-cmd --add-service=https --permanent 2>/dev/null || true
  firewall-cmd --reload 2>/dev/null || true
  log "防火墙已开放 80/443 端口"
fi

# =============================================
step "Step 9/9: 部署验证"
# =============================================

echo ""
echo "正在进行部署验证..."
sleep 2

# 1. PM2状态检查
echo ""
echo "--- PM2 进程状态 ---"
pm2 status

# 2. HTTP健康检查
echo ""
echo "--- 健康检查 ---"
if curl -sf http://127.0.0.1:3000/health > /dev/null 2>&1; then
  HEALTH_RESP=$(curl -s http://127.0.0.1:3000/health)
  echo -e "${GREEN}✅ 后端服务运行正常${NC}"
  echo "$HEALTH_RESP" | python3 -m json.tool 2>/dev/null || echo "$HEALTH_RESP"
else
  err "❌ 后端服务健康检查失败！请检查日志: pm2 logs yujian-backend --lines 30"
fi

# 3. Nginx代理检查
echo ""
if curl -sf http://127.0.0.1:80/health > /dev/null 2>&1; then
  echo -e "${GREEN}✅ Nginx代理正常${NC}"
else
  warn "⚠️  Nginx代理检查失败，请确认80端口已开放"
fi

# 4. MySQL连接检查
echo ""
if mysql -uyujian -p"${MYSQL_PWD}" -h127.0.0.1 -e "SELECT 'OK' AS db_status;" yujian 2>/dev/null; then
  echo -e "${GREEN}✅ MySQL数据库连接正常${NC}"
else
  warn "⚠️  MySQL连接失败，应用将使用内存降级方案运行"
fi

# 5. Redis连接检查
echo ""
if redis-cli -a "$REDIS_PWD" ping 2>/dev/null | grep -q PONG; then
  echo -e "${GREEN}✅ Redis连接正常${NC}"
else
  warn "⚠️  Redis连接失败，应用将使用内存降级方案运行"
fi

# 6. 磁盘空间
echo ""
DISK_USAGE=$(df -h / | awk 'NR==2 {print $5}')
log "磁盘使用率: $DISK_USAGE"

# 7. 内存使用
MEM_USAGE=$(free -m | awk '/^Mem:/{printf "%.0f%%", $3/$2*100}')
log "内存使用率: $MEM_USAGE"

# =============================================
# 完成输出
# =============================================
echo ""
echo -e "${GREEN}=============================================="
echo "  ✅  遇见APP - ECS 部署完成！"
echo "==============================================${NC}"
echo ""
echo "📋 重要信息（请妥善保存）:"
echo "   MySQL 用户: yujian"
echo "   MySQL 密码: ${MYSQL_PWD}"
echo "   Redis 密码: ${REDIS_PWD}"
echo "   JWT Secret: ${JWT_SECRET}"
echo ""
echo "🔧 常用命令:"
echo "   查看状态: pm2 status"
echo "   查看日志: pm2 logs yujian-backend"
echo "   重启服务: pm2 restart yujian-backend"
echo "   健康检查: curl http://localhost:3000/health"
echo "   诊断工具: bash /home/app/yujian/diagnose.sh"
echo ""
echo "⚠️  待办事项:"
echo "   1. 阿里云安全组开放 80 和 443 端口"
echo "   2. 修改 .env 中 ALLOWED_ORIGINS 为实际域名"
echo "   3. 配置 SSL 证书（nginx.conf 中取消注释SSL配置）"
echo "   4. 配置 DNS 解析（如有域名）"
echo "   5. 浏览器访问: http://$(curl -s ifconfig.me 2>/dev/null || echo '你的ECS公网IP')"
echo ""
echo "📝 配置文件位置:"
echo "   应用: /home/app/yujian/"
echo "   环境: /home/app/yujian/.env"
echo "   Nginx: /etc/nginx/nginx.conf"
echo "   日志: /home/app/yujian/logs/"
echo "=============================================="
