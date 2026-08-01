-- ============================================================
-- 0000_baseline.sql 初始基线迁移
-- 说明：
--   schema.sql（仓库根）是唯一基线初始化脚本，创建 33 张核心表 + 种子数据。
--   本迁移仅创建 schema_migrations 表，供 migrate.js 记录后续迁移执行状态。
--   migrate.js 启动时也会 ensure 该表（幂等）。
-- 执行：node src/db/migrate.js
-- ============================================================

CREATE TABLE IF NOT EXISTS schema_migrations (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  migration_name VARCHAR(255) NOT NULL UNIQUE,
  applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  checksum CHAR(32) NOT NULL COMMENT '脚本内容 MD5，用于检测脚本被修改'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='数据库迁移记录表';
