-- 文件：add_call_table.sql
-- 用途：语音/视频通话系统 - 数据库迁移脚本（幂等，可重复执行）
-- 用法：mysql -u root -p yujian < src/db/add_call_table.sql

USE yujian;

-- 通话记录表
CREATE TABLE IF NOT EXISTS call_records (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    channel_name VARCHAR(100) NOT NULL COMMENT 'Agora频道名',
    caller_id INT UNSIGNED NOT NULL COMMENT '发起方用户ID',
    callee_id INT UNSIGNED NOT NULL COMMENT '接收方用户ID',
    call_type ENUM('voice', 'video') NOT NULL COMMENT '通话类型',
    status ENUM('ringing', 'connected', 'ended', 'missed', 'rejected', 'cancelled') NOT NULL DEFAULT 'ringing' COMMENT '通话状态',
    started_at DATETIME DEFAULT NULL COMMENT '发起时间',
    connected_at DATETIME DEFAULT NULL COMMENT '接通时间',
    ended_at DATETIME DEFAULT NULL COMMENT '结束时间',
    duration INT DEFAULT 0 COMMENT '通话时长（秒）',
    end_reason VARCHAR(50) DEFAULT NULL COMMENT '结束原因',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    INDEX idx_caller (caller_id, created_at),
    INDEX idx_callee (callee_id, created_at),
    FOREIGN KEY (caller_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (callee_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='通话记录表';
