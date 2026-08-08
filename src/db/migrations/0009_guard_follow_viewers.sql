-- =====================================================
-- 0009 守护关系表 + 访客聚合索引
-- 功能：我的主页新增「守护/关注/粉丝/访客」四标签页 + 消息列表内「最近访客」。
--   1) user_guards：守护关系（谁守护了谁），守护列表/计数数据源。
--   2) user_views 增加 (target_user_id, user_id) 去重索引：
--      访客列表需按「访客聚合+访问次数+最近访问时间」查询，现有 idx_target_user 仅单列，
--      无法快速排除同访客重复行，补联合索引加速聚合。
-- 幂等：information_schema 判重 + 动态 SQL（参照 0006/0008 模式，兼容 MySQL 5.7/8.0）。
-- =====================================================

-- 1) 守护关系表
CREATE TABLE IF NOT EXISTS user_guards (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    guard_user_id INT UNSIGNED NOT NULL COMMENT '守护者（主动守护的人）ID',
    guarded_user_id INT UNSIGNED NOT NULL COMMENT '被守护者ID',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '守护时间',
    UNIQUE KEY uk_guard_guarded (guard_user_id, guarded_user_id),
    INDEX idx_guarded (guarded_user_id),
    FOREIGN KEY (guard_user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (guarded_user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='守护关系表';

-- 2) user_views 访客聚合去重索引
SET @idx_exists = (SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'user_views' AND index_name = 'idx_target_viewer');
SET @sql = IF(@idx_exists = 0,
  'CREATE INDEX idx_target_viewer ON user_views (target_user_id, user_id)',
  'SELECT ''idx_target_viewer 已存在，跳过''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
