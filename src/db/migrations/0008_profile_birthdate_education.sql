-- =====================================================
-- 0008 用户资料：新增出生日期 + 学历字段
-- 编辑资料页：年龄改为出生年月日滚轮选择；新增学历滚轮。
-- 幂等：用 information_schema.columns 判重 + PREPARE/EXECUTE 动态 SQL
--       （MySQL 8.0 的 ADD COLUMN IF NOT EXISTS 不可用，参照 0006 模式）。
-- 注：age 列保留，由出生日期同步派生（写入时计算），避免影响现有匹配/推荐/展示。
-- =====================================================

-- 1) 出生日期
SET @col_exists = (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'users' AND column_name = 'birth_date');
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE users ADD COLUMN birth_date DATE DEFAULT NULL COMMENT ''出生日期'' AFTER age',
  'SELECT ''birth_date 已存在，跳过''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2) 学历
SET @col_exists2 = (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'users' AND column_name = 'education');
SET @sql2 = IF(@col_exists2 = 0,
  'ALTER TABLE users ADD COLUMN education VARCHAR(20) DEFAULT NULL COMMENT ''学历'' AFTER occupation',
  'SELECT ''education 已存在，跳过''');
PREPARE stmt2 FROM @sql2; EXECUTE stmt2; DEALLOCATE PREPARE stmt2;
