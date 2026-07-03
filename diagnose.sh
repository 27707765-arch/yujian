#!/bin/bash
# ==========================================
# 遇见APP - ECS连接诊断工具 v1.0
# 用法: bash diagnose.sh
# 功能: 一键排查阿里云ECS上的连接与网络问题
# ==========================================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

PASS=0
FAIL=0
WARN=0

check_pass() { echo -e "  ${GREEN}✅ $1${NC}"; PASS=$((PASS + 1)); }
check_fail() { echo -e "  ${RED}❌ $1${NC}"; FAIL=$((FAIL + 1)); }
check_warn() { echo -e "  ${YELLOW}⚠️  $1${NC}"; WARN=$((WARN + 1)); }
section()  { echo -e "\n${BLUE}━━━ $1 ━━━${NC}"; }

# 加载.env配置
if [ -f /home/app/yujian/.env ]; then
  export $(grep -v '^#' /home/app/yujian/.env | grep -v '^$' | xargs)
elif [ -f .env ]; then
  export $(grep -v '^#' .env | grep -v '^$' | xargs)
fi

DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-3306}"
DB_USER="${DB_USER:-yujian}"
REDIS_HOST="${REDIS_HOST:-127.0.0.1}"
REDIS_PORT="${REDIS_PORT:-6379}"
APP_PORT="${PORT:-3000}"

echo "=============================================="
echo "  🔍 遇见APP - 连接诊断工具"
echo "  $(date '+%Y-%m-%d %H:%M:%S')"
echo "=============================================="

# =============================================
section "1. 系统资源检查"
# =============================================

# 内存
MEM_TOTAL=$(free -m | awk '/^Mem:/{print $2}')
MEM_USED=$(free -m | awk '/^Mem:/{print $3}')
MEM_PCT=$((MEM_USED * 100 / MEM_TOTAL))
if [ "$MEM_PCT" -gt 90 ]; then
  check_warn "内存使用率过高: ${MEM_PCT}% (${MEM_USED}MB/${MEM_TOTAL}MB)"
elif [ "$MEM_PCT" -gt 70 ]; then
  check_warn "内存使用率偏高: ${MEM_PCT}%"
else
  check_pass "内存正常: ${MEM_PCT}% (${MEM_TOTAL}MB 总量)"
fi

# 磁盘
DISK_PCT=$(df -h / | awk 'NR==2 {print $5}' | sed 's/%//')
if [ "$DISK_PCT" -gt 90 ]; then
  check_fail "磁盘空间不足: ${DISK_PCT}%"
elif [ "$DISK_PCT" -gt 80 ]; then
  check_warn "磁盘空间偏高: ${DISK_PCT}%"
else
  check_pass "磁盘空间正常: ${DISK_PCT}%"
fi

# CPU负载
LOAD=$(uptime | awk -F'load average:' '{print $2}' | awk '{print $1}' | sed 's/,//')
CPU_CORES=$(nproc)
LOAD_HIGH=$(echo "$LOAD > $CPU_CORES * 0.8" | bc 2>/dev/null || echo "0")
if [ "$LOAD_HIGH" = "1" ]; then
  check_warn "CPU负载偏高: ${LOAD} (${CPU_CORES}核)"
else
  check_pass "CPU负载正常: ${LOAD} (${CPU_CORES}核)"
fi

# 网络连接数
CONN_COUNT=$(ss -s | grep -oP 'estab \K\d+' 2>/dev/null || echo "0")
if [ "$CONN_COUNT" -gt 1000 ]; then
  check_warn "已建立连接数较多: ${CONN_COUNT}"
else
  check_pass "已建立连接数: ${CONN_COUNT}"
fi

# =============================================
section "2. 端口监听检查"
# =============================================

# Node.js 应用端口
if ss -tlnp | grep -q ":${APP_PORT} "; then
  check_pass "应用端口 ${APP_PORT} 正在监听"
else
  check_fail "应用端口 ${APP_PORT} 未监听！请检查: pm2 status"
fi

# Nginx 80端口
if ss -tlnp | grep -q ':80 '; then
  check_pass "Nginx 80端口正在监听"
else
  check_warn "Nginx 80端口未监听！请检查: systemctl status nginx"
fi

# 443端口（SSL）
if ss -tlnp | grep -q ':443 '; then
  check_pass "HTTPS 443端口正在监听"
else
  check_warn "HTTPS 443端口未监听（如不使用SSL可忽略）"
fi

# MySQL端口
if ss -tlnp | grep -q ":${DB_PORT} "; then
  check_pass "MySQL端口 ${DB_PORT} 正在监听"
else
  check_fail "MySQL端口 ${DB_PORT} 未监听！请检查: systemctl status mysqld"
fi

# Redis端口
if ss -tlnp | grep -q ":${REDIS_PORT} "; then
  check_pass "Redis端口 ${REDIS_PORT} 正在监听"
else
  check_fail "Redis端口 ${REDIS_PORT} 未监听！请检查: systemctl status redis"
fi

# =============================================
section "3. 数据库连接检查"
# =============================================

# MySQL连接测试
if command -v mysql &>/dev/null; then
  if [ -n "$DB_PASSWORD" ]; then
    if mysql -u"$DB_USER" -p"$DB_PASSWORD" -h"$DB_HOST" -P"$DB_PORT" -e "SELECT 1 AS test" 2>/dev/null | grep -q 1; then
      check_pass "MySQL连接成功 (${DB_USER}@${DB_HOST}:${DB_PORT})"

      # 检查表是否存在
      TABLE_COUNT=$(mysql -u"$DB_USER" -p"$DB_PASSWORD" -h"$DB_HOST" -P"$DB_PORT" -N -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='${DB_NAME:-yujian}'" 2>/dev/null || echo "0")
      if [ "$TABLE_COUNT" -gt 5 ]; then
        check_pass "数据库表数量: ${TABLE_COUNT}"
      elif [ "$TABLE_COUNT" -gt 0 ]; then
        check_warn "数据库表数量偏少: ${TABLE_COUNT}（可能未导入schema.sql）"
      else
        check_fail "数据库中没有表！请导入: mysql < schema.sql"
      fi
    else
      check_fail "MySQL连接失败！请检查用户名密码和网络"
    fi
  else
    check_warn "DB_PASSWORD未设置，跳过MySQL连接测试"
  fi
else
  check_fail "mysql客户端未安装"
fi

# Redis连接测试
if command -v redis-cli &>/dev/null; then
  REDIS_AUTH=""
  [ -n "$REDIS_PASSWORD" ] && REDIS_AUTH="-a $REDIS_PASSWORD --no-auth-warning"
  if redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" $REDIS_AUTH ping 2>/dev/null | grep -q PONG; then
    check_pass "Redis连接成功 (${REDIS_HOST}:${REDIS_PORT})"

    # Redis内存检查
    REDIS_MEM=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" $REDIS_AUTH INFO memory 2>/dev/null | grep used_memory_human | cut -d: -f2 | tr -d '\r')
    [ -n "$REDIS_MEM" ] && check_pass "Redis内存使用: ${REDIS_MEM}"
  else
    check_fail "Redis连接失败！请检查密码和Redis服务状态"
  fi
else
  check_fail "redis-cli未安装"
fi

# =============================================
section "4. HTTP服务检查"
# =============================================

# 直接访问Node.js
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 "http://127.0.0.1:${APP_PORT}/health" 2>/dev/null)
if [ "$HTTP_CODE" = "200" ]; then
  check_pass "直接访问后端 /health 正常 (HTTP ${HTTP_CODE})"

  # 获取健康检查详情
  HEALTH_JSON=$(curl -s --connect-timeout 5 "http://127.0.0.1:${APP_PORT}/health" 2>/dev/null)
  DB_STATUS=$(echo "$HEALTH_JSON" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('services',{}).get('db',{}).get('status','?'))" 2>/dev/null || echo "?")
  REDIS_STATUS=$(echo "$HEALTH_JSON" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('services',{}).get('redis',{}).get('status','?'))" 2>/dev/null || echo "?")

  if [ "$DB_STATUS" = "ok" ]; then
    check_pass "  后端报告: 数据库连接正常"
  elif [ "$DB_STATUS" = "?" ]; then
    check_warn "  无法解析健康检查响应（可能为旧版/health）"
  else
    check_warn "  后端报告: 数据库状态=${DB_STATUS}"
  fi

  if [ "$REDIS_STATUS" = "ok" ]; then
    check_pass "  后端报告: Redis连接正常"
  elif [ "$REDIS_STATUS" != "?" ]; then
    check_warn "  后端报告: Redis状态=${REDIS_STATUS}"
  fi
elif [ "$HTTP_CODE" = "503" ]; then
  check_warn "后端 /health 返回 503（服务降级运行，依赖服务不可用）"
else
  check_fail "直接访问后端失败 (HTTP ${HTTP_CODE})！请检查: pm2 logs yujian-backend"
fi

# 通过Nginx代理访问
NGINX_CODE=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 "http://127.0.0.1:80/health" 2>/dev/null)
if [ "$NGINX_CODE" = "200" ] || [ "$NGINX_CODE" = "503" ]; then
  check_pass "通过Nginx代理访问 /health 正常 (HTTP ${NGINX_CODE})"
elif [ "$NGINX_CODE" = "000" ]; then
  check_fail "通过Nginx代理访问超时！请检查Nginx配置和指向"
else
  check_warn "通过Nginx代理访问返回 HTTP ${NGINX_CODE}"
fi

# =============================================
section "5. 防火墙与安全组检查"
# =============================================

# 检测firewalld
if command -v firewall-cmd &>/dev/null; then
  if firewall-cmd --state 2>/dev/null | grep -q running; then
    check_pass "firewalld正在运行"
    if firewall-cmd --list-services 2>/dev/null | grep -q http; then
      check_pass "HTTP服务已添加到防火墙白名单"
    else
      check_warn "HTTP服务未添加到防火墙白名单"
    fi
  else
    check_warn "firewalld未运行（依赖阿里云安全组）"
  fi
else
  check_warn "firewalld未安装（依赖阿里云安全组）"
fi

# 检测阿里云安全组（提示性）
check_warn "阿里云安全组请前往控制台确认已开放: 80, 443 端口"

# 检查iptables
if command -v iptables &>/dev/null; then
  IPT_RULES=$(iptables -L -n 2>/dev/null | grep -cE '(:80|:443)' || echo "0")
  if [ "$IPT_RULES" -gt 0 ]; then
    check_pass "iptables中有HTTP相关规则"
  fi
fi

# 公网可达性（从ECS内部测试）
echo ""
echo "--- 外网可达性测试 ---"
if command -v curl &>/dev/null; then
  # 获取公网IP
  PUBLIC_IP=$(curl -s --connect-timeout 5 ifconfig.me 2>/dev/null || curl -s --connect-timeout 5 icanhazip.com 2>/dev/null || echo "unknown")
  if [ "$PUBLIC_IP" != "unknown" ]; then
    check_pass "ECS公网IP: ${PUBLIC_IP}"

    # 测试外网访问（从本机访问自己的公网IP）
    SELF_CODE=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 10 "http://${PUBLIC_IP}/health" 2>/dev/null)
    if [ "$SELF_CODE" = "200" ] || [ "$SELF_CODE" = "503" ]; then
      check_pass "公网访问自身 /health 正常 (HTTP ${SELF_CODE})"
    else
      check_warn "公网访问自身失败 (HTTP ${SELF_CODE})，可能是安全组未开放80端口"
    fi
  else
    check_warn "无法获取公网IP（网络可能不通）"
  fi
else
  check_fail "curl未安装"
fi

# =============================================
section "6. PM2服务状态"
# =============================================

if command -v pm2 &>/dev/null; then
  PM2_STATUS=$(pm2 jlist 2>/dev/null | python3 -c "
import sys,json
try:
    procs = json.load(sys.stdin)
    for p in procs:
        print(f'{p[\"name\"]}: {p[\"status\"]} (重启{p.get(\"restart_time\",0)}次, 内存{p.get(\"monit\",{}).get(\"memory\",\"?\")})')
except: print('PM2状态解析失败')
" 2>/dev/null)

  if [ -n "$PM2_STATUS" ]; then
    echo "$PM2_STATUS" | while read line; do
      if echo "$line" | grep -q "online"; then
        check_pass "$line"
      else
        check_fail "$line"
      fi
    done
  else
    check_fail "PM2中无运行进程或解析失败"
  fi

  # 最近日志
  echo ""
  echo "--- 最近错误日志 (最后5行) ---"
  pm2 logs yujian-backend --lines 5 --nostream 2>/dev/null | tail -10 || true
else
  check_fail "PM2未安装"
fi

# =============================================
section "7. Nginx配置检查"
# =============================================

if command -v nginx &>/dev/null; then
  if nginx -t 2>&1; then
    check_pass "Nginx配置语法正确"
  else
    check_fail "Nginx配置语法错误！"
  fi

  # 错误日志最后几行
  if [ -f /var/log/nginx/error.log ]; then
    ERR_LOG_TAIL=$(tail -5 /var/log/nginx/error.log 2>/dev/null | grep -v '^$' | wc -l)
    if [ "$ERR_LOG_TAIL" -gt 0 ]; then
      echo ""
      echo "--- Nginx最近错误 ---"
      tail -5 /var/log/nginx/error.log 2>/dev/null || true
    fi
  fi
else
  check_fail "Nginx未安装"
fi

# =============================================
section "8. DNS与域名检查（如有配置）"
# =============================================

DOMAIN=$(grep server_name /etc/nginx/nginx.conf 2>/dev/null | grep -v '#' | grep -v localhost | grep -oP 'server_name\s+\K[^;]+' | head -1)
if [ -n "$DOMAIN" ] && [ "$DOMAIN" != "localhost" ]; then
  check_pass "检测到配置域名: ${DOMAIN}"
  # DNS解析测试
  if command -v nslookup &>/dev/null; then
    if nslookup "$DOMAIN" 2>/dev/null | grep -q 'Address'; then
      check_pass "DNS解析正常: ${DOMAIN}"
    else
      check_warn "域名 ${DOMAIN} 可能未配置DNS解析"
    fi
  fi
else
  check_warn "未配置域名（使用IP访问）"
fi

# =============================================
# 总结
# =============================================
echo ""
echo "=============================================="
echo "  📊 诊断结果汇总"
echo "=============================================="
echo -e "  ${GREEN}通过: ${PASS}${NC}"
echo -e "  ${RED}失败: ${FAIL}${NC}"
echo -e "  ${YELLOW}警告: ${WARN}${NC}"
echo ""

if [ "$FAIL" -eq 0 ]; then
  echo -e "${GREEN}  ✅ 所有检查通过，服务运行正常！${NC}"
elif [ "$FAIL" -le 2 ]; then
  echo -e "${YELLOW}  ⚠️  存在 ${FAIL} 个问题，服务可能降级运行${NC}"
else
  echo -e "${RED}  ❌ 存在 ${FAIL} 个严重问题，服务可能不可用！${NC}"
  echo ""
  echo "🔧 常见修复步骤:"
  echo "  1. MySQL未启动: systemctl start mysqld"
  echo "  2. Redis未启动: systemctl start redis"
  echo "  3. 应用未启动: pm2 restart yujian-backend"
  echo "  4. Nginx未启动: systemctl restart nginx"
  echo "  5. 安全组未开放: 登录阿里云控制台 → ECS → 安全组 → 添加规则"
fi

echo ""
echo "📝 日志文件位置:"
echo "  后端: /home/app/yujian/logs/ 或 pm2 logs yujian-backend"
echo "  Nginx: /var/log/nginx/error.log"
echo "  MySQL: /var/log/mysqld.log"
echo "  Redis: journalctl -u redis"
echo ""
