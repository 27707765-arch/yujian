-- 文件名：fix_all_issues.sql
-- 用途：修复消息保存和用户推荐问题
-- 执行方式：mysql -u yujian -p'Yujian@2024DB' yujian < fix_all_issues.sql

USE yujian;

-- ============================================================
-- 1. 修复messages表：添加缺失的字段
-- ============================================================

-- 先检查字段是否存在，不存在则添加
SET @dbname = 'yujian';
SET @tablename = 'messages';

-- voice_url
SET @column_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS 
  WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = @tablename AND COLUMN_NAME = 'voice_url'
);
SET @sql = IF(@column_exists = 0, 
  'ALTER TABLE messages ADD COLUMN voice_url VARCHAR(500) DEFAULT NULL COMMENT ''语音文件URL''', 
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- voice_duration
SET @column_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS 
  WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = @tablename AND COLUMN_NAME = 'voice_duration'
);
SET @sql = IF(@column_exists = 0, 
  'ALTER TABLE messages ADD COLUMN voice_duration INT DEFAULT 0 COMMENT ''语音时长(秒)''', 
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- video_url
SET @column_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS 
  WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = @tablename AND COLUMN_NAME = 'video_url'
);
SET @sql = IF(@column_exists = 0, 
  'ALTER TABLE messages ADD COLUMN video_url VARCHAR(500) DEFAULT NULL COMMENT ''视频文件URL''', 
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- video_duration
SET @column_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS 
  WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = @tablename AND COLUMN_NAME = 'video_duration'
);
SET @sql = IF(@column_exists = 0, 
  'ALTER TABLE messages ADD COLUMN video_duration INT DEFAULT 0 COMMENT ''视频时长(秒)''', 
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- video_cover
SET @column_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS 
  WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = @tablename AND COLUMN_NAME = 'video_cover'
);
SET @sql = IF(@column_exists = 0, 
  'ALTER TABLE messages ADD COLUMN video_cover VARCHAR(500) DEFAULT NULL COMMENT ''视频封面URL''', 
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- sticker_id
SET @column_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS 
  WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = @tablename AND COLUMN_NAME = 'sticker_id'
);
SET @sql = IF(@column_exists = 0, 
  'ALTER TABLE messages ADD COLUMN sticker_id INT UNSIGNED DEFAULT NULL COMMENT ''贴纸ID''', 
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- location_data
SET @column_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS 
  WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = @tablename AND COLUMN_NAME = 'location_data'
);
SET @sql = IF(@column_exists = 0, 
  'ALTER TABLE messages ADD COLUMN location_data JSON DEFAULT NULL COMMENT ''位置数据''', 
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- gift_data
SET @column_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS 
  WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = @tablename AND COLUMN_NAME = 'gift_data'
);
SET @sql = IF(@column_exists = 0, 
  'ALTER TABLE messages ADD COLUMN gift_data JSON DEFAULT NULL COMMENT ''礼物数据''', 
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- is_recalled
SET @column_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS 
  WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = @tablename AND COLUMN_NAME = 'is_recalled'
);
SET @sql = IF(@column_exists = 0, 
  'ALTER TABLE messages ADD COLUMN is_recalled TINYINT(1) DEFAULT 0 COMMENT ''是否已撤回''', 
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- recalled_at
SET @column_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS 
  WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = @tablename AND COLUMN_NAME = 'recalled_at'
);
SET @sql = IF(@column_exists = 0, 
  'ALTER TABLE messages ADD COLUMN recalled_at DATETIME DEFAULT NULL COMMENT ''撤回时间''', 
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- updated_at
SET @column_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS 
  WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = @tablename AND COLUMN_NAME = 'updated_at'
);
SET @sql = IF(@column_exists = 0, 
  'ALTER TABLE messages ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT ''更新时间''', 
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ============================================================
-- 2. 修复users表：添加last_active_at字段
-- ============================================================

SET @tablename = 'users';
SET @column_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS 
  WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = @tablename AND COLUMN_NAME = 'last_active_at'
);
SET @sql = IF(@column_exists = 0, 
  'ALTER TABLE users ADD COLUMN last_active_at DATETIME DEFAULT NULL COMMENT ''最后活跃时间''', 
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 更新现有用户的last_active_at
UPDATE users SET last_active_at = updated_at WHERE last_active_at IS NULL;

-- ============================================================
-- 3. 添加索引
-- ============================================================

-- messages表索引
CREATE INDEX idx_conversation_created ON messages (conversation_id, created_at);
CREATE INDEX idx_receiver_status ON messages (receiver_id, status);

-- users表索引
CREATE INDEX idx_city ON users (city);
CREATE INDEX idx_last_active ON users (last_active_at);

-- ============================================================
-- 4. 添加虚拟测试用户
-- ============================================================

INSERT IGNORE INTO users (id, phone, nickname, avatar, gender, age, height, occupation, location, province, city, district, lat, lng, bio, status, last_active_at) VALUES
(1001, '13900001001', '甜心小鹿', '/uploads/default/avatar1.png', 0, 23, 165, '设计师', '北京市朝阳区', '北京市', '北京市', '朝阳区', 39.9219, 116.4435, '喜欢旅行和摄影', 1, NOW()),
(1002, '13900001002', '追风柴犬', '/uploads/default/avatar2.png', 1, 26, 178, '程序员', '北京市海淀区', '北京市', '北京市', '海淀区', 39.9593, 116.3268, '热爱编程和健身', 1, NOW()),
(1003, '13900001003', '慵懒橘猫', '/uploads/default/avatar3.png', 0, 22, 162, '学生', '北京市西城区', '北京市', '北京市', '西城区', 39.9123, 116.3660, '喜欢读书和咖啡', 1, NOW()),
(1004, '13900001004', '元气布丁', '/uploads/default/avatar4.png', 0, 24, 168, '教师', '北京市东城区', '北京市', '北京市', '东城区', 39.9185, 116.4188, '热爱教育和音乐', 1, NOW()),
(1005, '13900001005', '温柔汽水', '/uploads/default/avatar5.png', 1, 28, 180, '产品经理', '北京市丰台区', '北京市', '北京市', '丰台区', 39.8636, 116.2867, '喜欢户外运动', 1, NOW()),
(1006, '13900001006', '暴躁薯片', '/uploads/default/avatar6.png', 1, 25, 175, '设计师', '上海市浦东新区', '上海市', '上海市', '浦东新区', 31.2304, 121.4737, '创意无限', 1, NOW()),
(1007, '13900001007', '社恐椰子', '/uploads/default/avatar7.png', 0, 21, 160, '文案', '上海市静安区', '上海市', '上海市', '静安区', 31.2288, 121.4483, '安静的观察者', 1, NOW()),
(1008, '13900001008', '话痨月亮', '/uploads/default/avatar8.png', 0, 27, 170, '销售', '广州市天河区', '广州市', '广州市', '天河区', 23.1291, 113.2644, '热爱社交', 1, NOW()),
(1009, '13900001009', '佛系云朵', '/uploads/default/avatar9.png', 1, 30, 182, '自由职业', '深圳市南山区', '深圳市', '深圳市', '南山区', 22.5329, 113.9305, '随遇而安', 1, NOW()),
(1010, '13900001010', '野生风筝', '/uploads/default/avatar10.png', 0, 20, 163, '模特', '杭州市西湖区', '杭州市', '杭州市', '西湖区', 30.2741, 120.1551, '自由如风', 1, NOW());

-- ============================================================
-- 5. 验证修复结果
-- ============================================================

SELECT '✅ 数据库修复完成' AS status;
SELECT COUNT(*) AS total_users FROM users;
SELECT COUNT(*) AS total_messages FROM messages;
