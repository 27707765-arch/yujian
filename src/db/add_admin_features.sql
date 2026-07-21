-- 后台管理系统增强 - 数据库迁移
-- 任务2: 用户备注
CREATE TABLE IF NOT EXISTS user_admin_notes (user_id INT UNSIGNED PRIMARY KEY, note TEXT, updated_by INT UNSIGNED, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 任务3: 敏感词 + 审核记录
CREATE TABLE IF NOT EXISTS sensitive_words (id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, word VARCHAR(50) NOT NULL UNIQUE, category VARCHAR(30) DEFAULT 'general', level TINYINT DEFAULT 1, is_active TINYINT(1) DEFAULT 1, created_at DATETIME DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS audit_logs (id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, content_type VARCHAR(30) NOT NULL, content_id INT UNSIGNED NOT NULL, user_id INT UNSIGNED NOT NULL, content_text TEXT, audit_result VARCHAR(10) DEFAULT 'pending', reject_reason VARCHAR(200), auditor_id INT UNSIGNED, audited_at DATETIME, created_at DATETIME DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
ALTER TABLE posts ADD COLUMN audit_status VARCHAR(10) DEFAULT 'approved';
ALTER TABLE posts ADD COLUMN audit_reason VARCHAR(200);

-- 任务4: 系统配置 + 公告
CREATE TABLE IF NOT EXISTS system_configs (id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, config_key VARCHAR(50) NOT NULL UNIQUE, config_value TEXT NOT NULL, config_type VARCHAR(15) DEFAULT 'string', description VARCHAR(200), category VARCHAR(30) DEFAULT 'general', updated_by INT UNSIGNED, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS announcements (id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, title VARCHAR(100) NOT NULL, content TEXT NOT NULL, type VARCHAR(10) DEFAULT 'normal', target_users VARCHAR(10) DEFAULT 'all', priority INT DEFAULT 0, start_time DATETIME, end_time DATETIME, status VARCHAR(10) DEFAULT 'draft', created_by INT UNSIGNED, created_at DATETIME DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
INSERT IGNORE INTO system_configs (config_key, config_value, config_type, description, category) VALUES ('daily_free_likes','20','number','每日免费喜欢次数','limit'),('super_like_price','10','number','超级喜欢价格(金币)','limit'),('register_reward','15','number','注册奖励金币','reward'),('checkin_reward','5','number','签到奖励金币','reward'),('enable_register','true','boolean','是否开放注册','switch');

-- 任务5: 管理员权限
CREATE TABLE IF NOT EXISTS admin_users (id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, user_id INT UNSIGNED NOT NULL UNIQUE, admin_role VARCHAR(20) NOT NULL DEFAULT 'operator', permissions JSON, is_active TINYINT(1) DEFAULT 1, last_login_at DATETIME, created_at DATETIME DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS admin_operation_logs (id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, admin_id INT UNSIGNED NOT NULL, admin_name VARCHAR(50), action VARCHAR(50) NOT NULL, target_type VARCHAR(30), target_id INT UNSIGNED, detail JSON, ip VARCHAR(50), created_at DATETIME DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
INSERT IGNORE INTO admin_users (user_id, admin_role) SELECT id, 'super_admin' FROM users WHERE role='admin';

-- 任务6: 推送管理
CREATE TABLE IF NOT EXISTS push_records_adm (id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, title VARCHAR(100) NOT NULL, content TEXT NOT NULL, target_type VARCHAR(10) DEFAULT 'all', target_count INT DEFAULT 0, sent_count INT DEFAULT 0, status VARCHAR(10) DEFAULT 'draft', scheduled_at DATETIME, sent_at DATETIME, created_by INT UNSIGNED, created_at DATETIME DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS push_templates (id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, name VARCHAR(50) NOT NULL, title VARCHAR(100) NOT NULL, content TEXT NOT NULL, variables JSON, created_at DATETIME DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
