-- =====================================================
-- 0013 用户注销：users 增加注销申请时间列
-- 功能：用户申请注销时置 status=0（登录已被 status===0 拦截，天然闭环）
--      + 记录注销申请时间，供 14 天冷静期 / 客服恢复参考。
-- 幂等：information_schema 判重 + PREPARE/EXECUTE 动态 SQL（参照 0006/0008 模式）。
-- =====================================================
SET @col_exists = (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'users' AND column_name = 'deactivation_requested_at');

SET @ddl = IF(@col_exists = 0,
  'ALTER TABLE users ADD COLUMN deactivation_requested_at DATETIME DEFAULT NULL COMMENT ''注销申请时间（14天冷静期起点）''',
  'SELECT 1');

PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
