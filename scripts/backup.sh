#!/bin/bash
#
# 文件名：backup.sh
# 用途：MySQL 数据库备份（mysqldump + gzip + 7天保留）
# 用法：bash scripts/backup.sh [备份目录]
#
# 依赖环境变量（从 .env 或系统环境读取，永不硬编码密码）：
#   DB_USER     默认 root
#   DB_PASSWORD 必填（生产环境请从 .env 注入）
#   DB_NAME     默认 yujian
#   DB_HOST     默认 127.0.0.1
#   DB_PORT     默认 3306
#
# 示例 crontab（每天凌晨 3:05 备份）：
#   5 3 * * * cd /home/app/yujian && bash scripts/backup.sh >> /home/app/backups/backup.log 2>&1

set -euo pipefail

cd "$(dirname "$0")/.."

# ==================== 配置 ====================
# 若存在 .env 则加载（仅取需要的变量，避免覆盖已有环境变量）
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

BACKUP_DIR="${1:-/home/app/backups}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-7}"

# ==================== 备份 ====================
mkdir -p "$BACKUP_DIR"
STAMP="$(date +%Y%m%d_%H%M%S)"
FILE="$BACKUP_DIR/${DB_NAME}_${STAMP}.sql.gz"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] 开始备份 $DB_NAME ..."
mysqldump \
  -h"$DB_HOST" -P"$DB_PORT" -u"$DB_USER" -p"$DB_PASSWORD" \
  --single-transaction \
  --quick \
  --default-character-set=utf8mb4 \
  "$DB_NAME" 2>/dev/null | gzip > "$FILE"

# 校验文件非空
if [ ! -s "$FILE" ]; then
  echo "❌ 备份失败：生成的文件为空，请检查 mysqldump 权限与连接配置"
  rm -f "$FILE"
  exit 1
fi

echo "✅ 备份完成：$FILE ($(du -h "$FILE" | cut -f1))"

# ==================== 保留策略（默认保留7天） ====================
DELETED=$(find "$BACKUP_DIR" -name "${DB_NAME}_*.sql.gz" -mtime +"$KEEP_DAYS" -delete -print 2>/dev/null || true)
if [ -n "$DELETED" ]; then
  echo "🧹 已清理 ${KEEP_DAYS} 天前的备份:"
  echo "$DELETED"
fi

echo "[$(date '+%Y-%m-%d %H:%M:%S')] 备份完成 ✅"
