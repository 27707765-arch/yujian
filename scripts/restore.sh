#!/bin/bash
#
# 文件名：restore.sh
# 用途：从备份 gz 文件恢复 MySQL 数据库
# 用法：bash scripts/restore.sh /home/app/backups/yujian_20260801_030000.sql.gz
#
# ⚠️ 危险操作：会覆盖目标库现有数据，执行前务必确认！
# 建议：恢复前先跑一次 backup.sh 做基线，或恢复到独立测试库验证。
#
# 依赖环境变量（同 backup.sh，不硬编码密码）：
#   DB_USER / DB_PASSWORD / DB_NAME / DB_HOST / DB_PORT

set -euo pipefail

cd "$(dirname "$0")/.."

if [ $# -lt 1 ]; then
  echo "❌ 用法: bash scripts/restore.sh <备份文件.sql.gz>"
  exit 1
fi

BACKUP="$1"
if [ ! -f "$BACKUP" ]; then
  echo "❌ 备份文件不存在: $BACKUP"
  exit 1
fi

# ==================== 配置 ====================
if [ -f .env ]; then
  set -a
  . ./.env
  set +a
fi

DB_USER="${DB_USER:-root}"
DB_PASSWORD="${DB_PASSWORD:?环境变量 DB_PASSWORD 未设置}"
DB_NAME="${DB_NAME:-yujian}"
DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-3306}"

# ==================== 二次确认 ====================
echo "⚠️  即将把 $BACKUP 恢复到数据库 $DB_NAME@$DB_HOST"
echo "   该操作会覆盖现有数据！"
read -rp "确认继续？输入 YES: " CONFIRM
if [ "$CONFIRM" != "YES" ]; then
  echo "已取消。"
  exit 0
fi

echo "[$(date '+%Y-%m-%d %H:%M:%S')] 开始恢复 $DB_NAME ..."
gunzip -c "$BACKUP" | mysql -h"$DB_HOST" -P"$DB_PORT" -u"$DB_USER" -p"$DB_PASSWORD" --default-character-set=utf8mb4 "$DB_NAME"

echo "✅ 恢复完成！"
echo "   下一步：pm2 restart yujian-backend --update-env"
echo "   核对：登录后台检查用户数/订单数/关键表行数是否与备份时间点一致"
