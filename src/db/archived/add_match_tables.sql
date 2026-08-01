-- 文件：add_match_tables.sql
-- 用途：智能匹配算法升级 - 数据库迁移脚本（幂等，可重复执行）
-- 用法：mysql -u root -p yujian < src/db/add_match_tables.sql

USE yujian;

-- 1. 用户行为记录表
CREATE TABLE IF NOT EXISTS user_behaviors (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL COMMENT '行为发起用户ID',
    target_user_id INT UNSIGNED NOT NULL COMMENT '目标用户ID',
    action ENUM('view', 'like', 'skip', 'message', 'match', 'unmatch') NOT NULL COMMENT '行为类型',
    duration INT DEFAULT NULL COMMENT '停留时长（秒）',
    source VARCHAR(50) DEFAULT NULL COMMENT '来源页面：recommend/search/profile',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    INDEX idx_user_action (user_id, action, created_at),
    INDEX idx_target (target_user_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (target_user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户行为记录表';

-- 2. 用户兴趣画像表
CREATE TABLE IF NOT EXISTS user_interest_profiles (
    user_id INT UNSIGNED PRIMARY KEY COMMENT '用户ID',
    interest_vector JSON DEFAULT NULL COMMENT '兴趣标签向量（标签→权重）',
    behavior_pattern JSON DEFAULT NULL COMMENT '行为模式统计',
    preference_age_min INT DEFAULT 18 COMMENT '偏好最小年龄',
    preference_age_max INT DEFAULT 35 COMMENT '偏好最大年龄',
    preference_distance INT DEFAULT 50 COMMENT '偏好距离(km)',
    preference_gender TINYINT(1) DEFAULT NULL COMMENT '偏好性别：0-女，1-男',
    last_active_at DATETIME DEFAULT NULL COMMENT '最后活跃时间',
    activity_score FLOAT DEFAULT 0 COMMENT '活跃度评分(0-100)',
    popularity_score FLOAT DEFAULT 0 COMMENT '受欢迎度评分(0-100)',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户兴趣画像表';
