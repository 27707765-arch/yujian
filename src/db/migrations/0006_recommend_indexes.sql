-- =====================================================
-- 0006 推荐接口查询性能索引
-- 修复：/api/match/recommend 首页推荐慢
--   1) users(city) 已有单列索引 idx_city，但同城查询是 WHERE city=? ORDER BY last_active_at DESC，
--      需联合索引 (city, last_active_at) 消除 filesort。
--   2) getActiveUsers（同城无结果时降级查活跃用户）ORDER BY updated_at DESC，补 (status, updated_at)。
-- 幂等：CREATE INDEX IF NOT EXISTS 不存在则创建，可安全重复执行。
-- 注意：MySQL 5.7 不支持 IF NOT EXISTS 于 CREATE INDEX，此处用存储过程判重保证兼容。
-- =====================================================

-- 1) 同城用户查询联合索引
SET @idx_exists = (SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'users' AND index_name = 'idx_city_last_active');
SET @sql = IF(@idx_exists = 0,
  'CREATE INDEX idx_city_last_active ON users (city, last_active_at)',
  'SELECT ''idx_city_last_active 已存在，跳过''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2) 活跃用户查询联合索引
SET @idx_exists2 = (SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'users' AND index_name = 'idx_status_updated');
SET @sql2 = IF(@idx_exists2 = 0,
  'CREATE INDEX idx_status_updated ON users (status, updated_at)',
  'SELECT ''idx_status_updated 已存在，跳过''');
PREPARE stmt2 FROM @sql2; EXECUTE stmt2; DEALLOCATE PREPARE stmt2;
