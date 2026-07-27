-- 文件名：fix_messages_table.sql
-- 用途：修复messages表，添加缺失的字段
-- 执行方式：mysql -u yujian -p'Yujian@2024DB' yujian < fix_messages_table.sql

USE yujian;

-- 添加语音消息字段
ALTER TABLE messages ADD COLUMN IF NOT EXISTS voice_url VARCHAR(500) DEFAULT NULL COMMENT '语音文件URL';
ALTER TABLE messages ADD COLUMN IF NOT EXISTS voice_duration INT DEFAULT 0 COMMENT '语音时长(秒)';

-- 添加视频消息字段
ALTER TABLE messages ADD COLUMN IF NOT EXISTS video_url VARCHAR(500) DEFAULT NULL COMMENT '视频文件URL';
ALTER TABLE messages ADD COLUMN IF NOT EXISTS video_duration INT DEFAULT 0 COMMENT '视频时长(秒)';
ALTER TABLE messages ADD COLUMN IF NOT EXISTS video_cover VARCHAR(500) DEFAULT NULL COMMENT '视频封面URL';

-- 添加贴纸消息字段
ALTER TABLE messages ADD COLUMN IF NOT EXISTS sticker_id INT UNSIGNED DEFAULT NULL COMMENT '贴纸ID';

-- 添加位置消息字段
ALTER TABLE messages ADD COLUMN IF NOT EXISTS location_data JSON DEFAULT NULL COMMENT '位置数据';

-- 添加礼物消息字段
ALTER TABLE messages ADD COLUMN IF NOT EXISTS gift_data JSON DEFAULT NULL COMMENT '礼物数据';

-- 添加消息撤回字段
ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_recalled TINYINT(1) DEFAULT 0 COMMENT '是否已撤回：0-否，1-是';
ALTER TABLE messages ADD COLUMN IF NOT EXISTS recalled_at DATETIME DEFAULT NULL COMMENT '撤回时间';

-- 添加updated_at字段
ALTER TABLE messages ADD COLUMN IF NOT EXISTS updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间';

-- 添加索引以优化查询性能
ALTER TABLE messages ADD INDEX IF NOT EXISTS idx_conversation_created (conversation_id, created_at);
ALTER TABLE messages ADD INDEX IF NOT EXISTS idx_receiver_status (receiver_id, status);
ALTER TABLE messages ADD INDEX IF NOT EXISTS idx_sender (sender_id);

-- 验证修改
DESCRIBE messages;
