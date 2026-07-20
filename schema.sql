-- 文件名：schema.sql
-- 用途：数据库表结构脚本

-- 创建数据库
CREATE DATABASE IF NOT EXISTS yujian DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE yujian;

-- 用户表
CREATE TABLE IF NOT EXISTS users (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    phone VARCHAR(11) NOT NULL UNIQUE COMMENT '手机号',
    nickname VARCHAR(50) NOT NULL COMMENT '昵称',
    avatar VARCHAR(255) DEFAULT NULL COMMENT '头像',
    gender TINYINT(1) DEFAULT NULL COMMENT '性别：0-女，1-男',
    age INT DEFAULT NULL COMMENT '年龄',
    height INT DEFAULT NULL COMMENT '身高(cm)',
    occupation VARCHAR(100) DEFAULT NULL COMMENT '职业',
    location VARCHAR(100) DEFAULT NULL COMMENT '位置',
    province VARCHAR(50) DEFAULT NULL COMMENT '省份',
    city VARCHAR(50) DEFAULT NULL COMMENT '地级市',
    district VARCHAR(50) DEFAULT NULL COMMENT '区县',
    lat DECIMAL(10, 6) DEFAULT NULL COMMENT '纬度',
    lng DECIMAL(10, 6) DEFAULT NULL COMMENT '经度',
    bio VARCHAR(500) DEFAULT NULL COMMENT '个性签名',
    is_vip TINYINT(1) DEFAULT 0 COMMENT '是否VIP：0-否，1-是',
    vip_expire_time DATETIME DEFAULT NULL COMMENT 'VIP过期时间',
    role VARCHAR(20) DEFAULT 'user' COMMENT '角色：user-普通用户，admin-管理员',
    status TINYINT(1) DEFAULT 1 COMMENT '状态：0-禁用，1-正常',
    email VARCHAR(100) DEFAULT NULL COMMENT '邮箱地址',
    email_verified TINYINT(1) DEFAULT 0 COMMENT '邮箱是否已验证',
    password_hash VARCHAR(255) DEFAULT NULL COMMENT 'bcrypt密码哈希',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    UNIQUE KEY uk_email (email),
    INDEX idx_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户表';

-- 会话表
CREATE TABLE IF NOT EXISTS conversations (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user1_id INT UNSIGNED NOT NULL COMMENT '用户1 ID',
    user2_id INT UNSIGNED NOT NULL COMMENT '用户2 ID',
    last_message VARCHAR(500) DEFAULT NULL COMMENT '最后一条消息',
    last_message_time DATETIME DEFAULT NULL COMMENT '最后一条消息时间',
    unread_count INT DEFAULT 0 COMMENT '未读消息数',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    UNIQUE KEY uk_user1_user2 (user1_id, user2_id),
    FOREIGN KEY (user1_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (user2_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='会话表';

-- 消息表
CREATE TABLE IF NOT EXISTS messages (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    conversation_id INT UNSIGNED NOT NULL COMMENT '会话ID',
    sender_id INT UNSIGNED NOT NULL COMMENT '发送者ID',
    receiver_id INT UNSIGNED NOT NULL COMMENT '接收者ID',
    content TEXT NOT NULL COMMENT '消息内容',
    type TINYINT(1) DEFAULT 0 COMMENT '消息类型：0-文字，1-图片',
    status TINYINT(1) DEFAULT 0 COMMENT '状态：0-未读，1-已读',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
    FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='消息表';

-- 喜欢记录表
CREATE TABLE IF NOT EXISTS likes (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL COMMENT '用户ID',
    target_user_id INT UNSIGNED NOT NULL COMMENT '目标用户ID',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    UNIQUE KEY uk_user_target (user_id, target_user_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (target_user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='喜欢记录表';

-- 匹配表
CREATE TABLE IF NOT EXISTS matches (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user1_id INT UNSIGNED NOT NULL COMMENT '用户1 ID',
    user2_id INT UNSIGNED NOT NULL COMMENT '用户2 ID',
    status TINYINT(1) DEFAULT 1 COMMENT '状态：0-解除匹配，1-匹配中',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    UNIQUE KEY uk_user1_user2 (user1_id, user2_id),
    FOREIGN KEY (user1_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (user2_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='匹配表';

-- 跳过记录表
CREATE TABLE IF NOT EXISTS skips (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL COMMENT '用户ID',
    target_user_id INT UNSIGNED NOT NULL COMMENT '被跳过的用户ID',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    UNIQUE KEY uk_user_target (user_id, target_user_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (target_user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='跳过记录表';

-- 用户浏览记录表
CREATE TABLE IF NOT EXISTS user_views (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL COMMENT '浏览者ID',
    target_user_id INT UNSIGNED NOT NULL COMMENT '被浏览者ID',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '浏览时间',
    INDEX idx_target_user (target_user_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (target_user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户浏览记录表';

-- 动态表
CREATE TABLE IF NOT EXISTS posts (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL COMMENT '发布者ID',
    content TEXT COMMENT '文字内容',
    images JSON DEFAULT NULL COMMENT '图片列表',
    like_count INT DEFAULT 0 COMMENT '点赞数',
    comment_count INT DEFAULT 0 COMMENT '评论数',
    status TINYINT(1) DEFAULT 1 COMMENT '状态：0-删除，1-正常',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='动态表';

-- 动态评论表
CREATE TABLE IF NOT EXISTS post_comments (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    post_id INT UNSIGNED NOT NULL COMMENT '动态ID',
    user_id INT UNSIGNED NOT NULL COMMENT '评论者ID',
    content TEXT NOT NULL COMMENT '评论内容',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='动态评论表';

-- 举报表
CREATE TABLE IF NOT EXISTS reports (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    reporter_id INT UNSIGNED NOT NULL COMMENT '举报者ID',
    reported_user_id INT UNSIGNED NOT NULL COMMENT '被举报用户ID',
    reason VARCHAR(200) NOT NULL COMMENT '举报原因',
    status TINYINT(1) DEFAULT 0 COMMENT '状态：0-待处理，1-已处理',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    FOREIGN KEY (reporter_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (reported_user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='举报表';

-- 会员套餐表
CREATE TABLE IF NOT EXISTS vip_packages (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(50) NOT NULL COMMENT '套餐名称',
    price DECIMAL(10, 2) NOT NULL COMMENT '价格',
    duration INT NOT NULL COMMENT '时长(天)',
    description VARCHAR(200) DEFAULT NULL COMMENT '描述',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='会员套餐表';

-- 订单表
CREATE TABLE IF NOT EXISTS orders (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL COMMENT '用户ID',
    package_id INT UNSIGNED NOT NULL COMMENT '套餐ID',
    order_no VARCHAR(50) NOT NULL UNIQUE COMMENT '订单号',
    amount DECIMAL(10, 2) NOT NULL COMMENT '金额',
    status TINYINT(1) DEFAULT 0 COMMENT '状态：0-待支付，1-已支付，2-已取消',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (package_id) REFERENCES vip_packages(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='订单表';

-- 用户相册表（多图上传）
CREATE TABLE IF NOT EXISTS user_photos (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL COMMENT '用户ID',
    url VARCHAR(255) NOT NULL COMMENT '图片URL',
    sort_order INT DEFAULT 0 COMMENT '排序',
    is_cover TINYINT(1) DEFAULT 0 COMMENT '是否为封面',
    status TINYINT(1) DEFAULT 1 COMMENT '状态：0-删除，1-正常',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户相册表';

-- 用户拉黑表
CREATE TABLE IF NOT EXISTS user_blocks (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL COMMENT '拉黑者ID',
    blocked_user_id INT UNSIGNED NOT NULL COMMENT '被拉黑者ID',
    reason VARCHAR(100) DEFAULT NULL COMMENT '拉黑原因',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    UNIQUE KEY uk_user_blocked (user_id, blocked_user_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (blocked_user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户拉黑表';

-- 兴趣标签表
CREATE TABLE IF NOT EXISTS tags (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(20) NOT NULL UNIQUE COMMENT '标签名称',
    category VARCHAR(20) DEFAULT NULL COMMENT '标签分类',
    sort_order INT DEFAULT 0 COMMENT '排序',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='兴趣标签表';

-- 用户-标签关联表
CREATE TABLE IF NOT EXISTS user_tags (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL COMMENT '用户ID',
    tag_id INT UNSIGNED NOT NULL COMMENT '标签ID',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    UNIQUE KEY uk_user_tag (user_id, tag_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户标签关联表';

-- 推送设备Token表
CREATE TABLE IF NOT EXISTS push_tokens (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL COMMENT '用户ID',
    platform VARCHAR(10) NOT NULL COMMENT '平台：ios/android/web',
    device_token VARCHAR(255) NOT NULL COMMENT '设备Token',
    is_active TINYINT(1) DEFAULT 1 COMMENT '是否有效',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='推送设备Token表';

-- 用户隐私设置表
CREATE TABLE IF NOT EXISTS user_settings (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL UNIQUE COMMENT '用户ID',
    hide_distance TINYINT(1) DEFAULT 0 COMMENT '隐藏距离：0-显示，1-隐藏',
    hide_online_status TINYINT(1) DEFAULT 0 COMMENT '隐藏在线状态',
    hide_last_active TINYINT(1) DEFAULT 0 COMMENT '隐藏最后活跃时间',
    allow_stranger_chat TINYINT(1) DEFAULT 1 COMMENT '允许陌生人私聊',
    message_notify TINYINT(1) DEFAULT 1 COMMENT '消息推送通知',
    match_notify TINYINT(1) DEFAULT 1 COMMENT '匹配推送通知',
    like_notify TINYINT(1) DEFAULT 1 COMMENT '喜欢推送通知',
    view_notify TINYINT(1) DEFAULT 1 COMMENT '浏览推送通知',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户隐私设置表';

-- 修改 users 表，增加 tags 和设置关联
ALTER TABLE users ADD COLUMN IF NOT EXISTS tags JSON DEFAULT NULL COMMENT '用户兴趣标签（JSON数组）' AFTER bio;
ALTER TABLE users ADD COLUMN IF NOT EXISTS photos_count INT DEFAULT 0 COMMENT '照片数量' AFTER avatar;

-- 插入默认会员套餐数据
INSERT INTO vip_packages (name, price, duration, description) VALUES
('月卡', 30.00, 30, '包月VIP特权'),
('季卡', 80.00, 90, '包季VIP特权'),
('年卡', 298.00, 365, '包年VIP特权'),
('金币充值', 0.00, 0, '金币充值（虚拟套餐）');

-- 插入默认兴趣标签
INSERT INTO tags (name, category, sort_order) VALUES
('健身', '运动', 1),
('跑步', '运动', 2),
('瑜伽', '运动', 3),
('篮球', '运动', 4),
('游泳', '运动', 5),
('旅行', '生活', 10),
('美食', '生活', 11),
('摄影', '生活', 12),
('宠物', '生活', 13),
('阅读', '文化', 20),
('音乐', '文化', 21),
('电影', '文化', 22),
('游戏', '娱乐', 30),
('动漫', '娱乐', 31),
('桌游', '娱乐', 32),
('咖啡', '生活', 14),
('露营', '生活', 15),
('滑雪', '运动', 6),
('冲浪', '运动', 7),
('设计', '文化', 23);

-- ==================== 第二阶段：礼物 & 钱包 & VIP ====================

-- 虚拟礼物表
CREATE TABLE IF NOT EXISTS gifts (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(30) NOT NULL COMMENT '礼物名称',
    image VARCHAR(255) DEFAULT NULL COMMENT '礼物图片',
    price INT UNSIGNED NOT NULL COMMENT '金币价格',
    animation_type VARCHAR(20) DEFAULT 'normal' COMMENT '动画类型：normal/luxury/special',
    category VARCHAR(20) DEFAULT '普通' COMMENT '分类：普通/豪华/特效',
    is_active TINYINT(1) DEFAULT 1 COMMENT '是否上架',
    sort_order INT DEFAULT 0 COMMENT '排序',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='虚拟礼物表';

-- 礼物赠送记录表
CREATE TABLE IF NOT EXISTS gift_records (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    sender_id INT UNSIGNED NOT NULL COMMENT '赠送者ID',
    receiver_id INT UNSIGNED NOT NULL COMMENT '接收者ID',
    gift_id INT UNSIGNED NOT NULL COMMENT '礼物ID',
    quantity INT DEFAULT 1 COMMENT '数量',
    total_price INT UNSIGNED NOT NULL COMMENT '总金币数',
    message VARCHAR(100) DEFAULT NULL COMMENT '留言',
    conversation_id INT UNSIGNED DEFAULT NULL COMMENT '关联会话ID',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '赠送时间',
    FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (gift_id) REFERENCES gifts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='礼物赠送记录表';

-- 用户钱包表
CREATE TABLE IF NOT EXISTS wallets (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL UNIQUE COMMENT '用户ID',
    balance INT DEFAULT 0 COMMENT '金币余额',
    total_recharge INT DEFAULT 0 COMMENT '累计充值（金币）',
    total_spent INT DEFAULT 0 COMMENT '累计消费（金币）',
    total_earned INT DEFAULT 0 COMMENT '累计收入（收到的礼物）',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户钱包表';

-- 金币交易流水表
CREATE TABLE IF NOT EXISTS coin_transactions (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL COMMENT '用户ID',
    type VARCHAR(20) NOT NULL COMMENT '类型：recharge/gift_send/gift_receive/refund/task_reward/checkin',
    amount INT NOT NULL COMMENT '金币数量（正=收入，负=支出）',
    balance_after INT NOT NULL COMMENT '交易后余额',
    reference_type VARCHAR(20) DEFAULT NULL COMMENT '关联类型：gift_record/order/task',
    reference_id INT UNSIGNED DEFAULT NULL COMMENT '关联记录ID',
    description VARCHAR(100) DEFAULT NULL COMMENT '交易描述',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '交易时间',
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='金币交易流水表';

-- VIP特权配置表
CREATE TABLE IF NOT EXISTS vip_privileges (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    level VARCHAR(20) NOT NULL COMMENT 'VIP等级：vip/svip',
    privilege_key VARCHAR(50) NOT NULL COMMENT '特权标识',
    privilege_name VARCHAR(50) NOT NULL COMMENT '特权名称',
    limit_value INT DEFAULT 0 COMMENT '限制值（0=无限）',
    description VARCHAR(200) DEFAULT NULL COMMENT '特权描述',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_level_key (level, privilege_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='VIP特权配置表';

-- ALTER: users 表增加 vip_level 字段
ALTER TABLE users ADD COLUMN IF NOT EXISTS vip_level VARCHAR(10) DEFAULT 'normal' COMMENT 'VIP等级：normal/vip/svip' AFTER is_vip;

-- 插入默认礼物数据
INSERT INTO gifts (name, price, animation_type, category, sort_order) VALUES
('玫瑰', 1, 'normal', '普通', 1),
('爱心', 5, 'normal', '普通', 2),
('巧克力', 10, 'normal', '普通', 3),
('钻戒', 50, 'luxury', '豪华', 10),
('跑车', 100, 'luxury', '豪华', 11),
('城堡', 500, 'special', '特效', 20),
('火箭', 999, 'special', '特效', 21);

-- 插入VIP特权配置
INSERT INTO vip_privileges (level, privilege_key, privilege_name, limit_value, description) VALUES
('vip', 'daily_likes', '每日喜欢上限', 100, 'VIP每日可喜欢的用户数'),
('vip', 'daily_views', '查看更多用户', 50, 'VIP每日推荐用户数'),
('vip', 'see_who_liked', '查看谁喜欢我', 1, '查看喜欢我的用户列表'),
('vip', 'read_receipt', '消息已读回执', 1, '查看消息是否已读'),
('vip', 'chat_sticker', '专属聊天贴纸', 1, 'VIP专属贴纸'),
('svip', 'daily_likes', '每日喜欢上限', 0, 'SVIP无限制喜欢'),
('svip', 'daily_views', '查看更多用户', 0, 'SVIP无限推荐'),
('svip', 'boost_exposure', '超级曝光', 3, '推荐权重提升3倍'),
('svip', 'voice_call', '语音通话', 1, '免费语音通话'),
('svip', 'video_call', '视频通话', 1, '免费视频通话'),
('svip', 'online_status', '查看在线状态', 1, '查看对方在线状态'),
('svip', 'chat_translate', '聊天翻译', 1, '多语言翻译');

-- ==================== 第三阶段：社区 + 签到 + 搜索 ====================

-- 动态点赞表
CREATE TABLE IF NOT EXISTS post_likes (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    post_id INT UNSIGNED NOT NULL COMMENT '动态ID',
    user_id INT UNSIGNED NOT NULL COMMENT '用户ID',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '点赞时间',
    UNIQUE KEY uk_post_user (post_id, user_id),
    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='动态点赞表';

-- 修改评论表支持嵌套
ALTER TABLE post_comments ADD COLUMN IF NOT EXISTS parent_id INT UNSIGNED DEFAULT NULL COMMENT '父评论ID，NULL=顶级评论' AFTER content;

-- 每日签到表
CREATE TABLE IF NOT EXISTS daily_checkins (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL COMMENT '用户ID',
    checkin_date DATE NOT NULL COMMENT '签到日期',
    streak_days INT DEFAULT 1 COMMENT '连续签到天数',
    reward_coins INT DEFAULT 0 COMMENT '奖励金币',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '签到时间',
    UNIQUE KEY uk_user_date (user_id, checkin_date),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='每日签到表';

-- 动态话题标签（ALTER posts 表）
ALTER TABLE posts ADD COLUMN IF NOT EXISTS topics JSON DEFAULT NULL COMMENT '话题标签' AFTER images;

-- ==================== 每日任务进度表 ====================
CREATE TABLE IF NOT EXISTS user_tasks (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL COMMENT '用户ID',
    task_key VARCHAR(30) NOT NULL COMMENT '任务标识',
    task_date DATE NOT NULL COMMENT '任务日期',
    progress INT DEFAULT 0 COMMENT '当日完成次数/进度',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    UNIQUE KEY uk_user_task_date (user_id, task_key, task_date),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='每日任务进度表';

-- users 表增加礼物统计字段
ALTER TABLE users ADD COLUMN IF NOT EXISTS gifts_received_count INT DEFAULT 0 COMMENT '收到礼物数';
ALTER TABLE users ADD COLUMN IF NOT EXISTS gifts_sent_count INT DEFAULT 0 COMMENT '送出礼物数';

-- messages 表增加消息撤回字段
ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_recalled TINYINT(1) DEFAULT 0 COMMENT '是否已撤回：0-未撤回，1-已撤回';
ALTER TABLE messages ADD COLUMN IF NOT EXISTS recalled_at DATETIME DEFAULT NULL COMMENT '撤回时间';

-- users 表增加新手引导完成标记
ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_completed TINYINT(1) DEFAULT 0 COMMENT '是否完成新手引导：0-未完成，1-已完成';

-- posts 表增加视频相关字段
ALTER TABLE posts ADD COLUMN IF NOT EXISTS video_url VARCHAR(500) DEFAULT NULL COMMENT '视频URL';
ALTER TABLE posts ADD COLUMN IF NOT EXISTS video_duration INT DEFAULT NULL COMMENT '视频时长(秒)';
ALTER TABLE posts ADD COLUMN IF NOT EXISTS video_cover VARCHAR(500) DEFAULT NULL COMMENT '视频封面URL';
ALTER TABLE posts ADD COLUMN IF NOT EXISTS edited_at DATETIME DEFAULT NULL COMMENT '最后编辑时间';

-- users 表增加行政区划字段（用于同城匹配）
ALTER TABLE users ADD COLUMN IF NOT EXISTS province VARCHAR(50) DEFAULT NULL COMMENT '省份' AFTER location;
ALTER TABLE users ADD COLUMN IF NOT EXISTS city VARCHAR(50) DEFAULT NULL COMMENT '地级市' AFTER province;
ALTER TABLE users ADD COLUMN IF NOT EXISTS district VARCHAR(50) DEFAULT NULL COMMENT '区县' AFTER city;

-- users 表增加同城/附近查询索引
-- 同城查询：按 city + status 过滤
CREATE INDEX IF NOT EXISTS idx_users_city ON users (city, status);
-- 附近查询：Bounding Box 预过滤走 lat/lng
CREATE INDEX IF NOT EXISTS idx_users_lat_lng ON users (lat, lng);

-- 推送日志表（用于排查推送失败问题）
CREATE TABLE IF NOT EXISTS push_logs (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL COMMENT '目标用户ID',
    title VARCHAR(100) NOT NULL COMMENT '推送标题',
    body VARCHAR(500) NOT NULL COMMENT '推送内容',
    data JSON DEFAULT NULL COMMENT '附加数据',
    push_type VARCHAR(30) NOT NULL COMMENT '推送类型：match/like/message/view/gift/security/system',
    channel VARCHAR(20) NOT NULL COMMENT '发送渠道：websocket/apns/android/huawei/xiaomi/oppo/vivo',
    status VARCHAR(20) NOT NULL DEFAULT 'pending' COMMENT '状态：pending/sent/failed/skipped',
    error_message VARCHAR(500) DEFAULT NULL COMMENT '失败原因',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    INDEX idx_push_logs_user (user_id),
    INDEX idx_push_logs_created (created_at),
    INDEX idx_push_logs_status (status),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='推送日志表';

-- 用户反馈表
CREATE TABLE IF NOT EXISTS feedbacks (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL COMMENT '反馈用户ID',
    content TEXT NOT NULL COMMENT '反馈内容',
    contact VARCHAR(100) DEFAULT NULL COMMENT '联系方式',
    status TINYINT DEFAULT 0 COMMENT '状态: 0=未处理 1=已处理',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户反馈表';

-- 评论点赞表
CREATE TABLE IF NOT EXISTS comment_likes (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    comment_id INT UNSIGNED NOT NULL COMMENT '评论ID',
    user_id INT UNSIGNED NOT NULL COMMENT '点赞用户ID',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_comment_user (comment_id, user_id),
    INDEX idx_comment_likes_comment (comment_id),
    INDEX idx_comment_likes_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='评论点赞表';

-- 会话表增加 is_pinned 字段（如果不存在）
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS is_pinned TINYINT DEFAULT 0 COMMENT '是否置顶';
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS is_deleted_by_user INT UNSIGNED DEFAULT NULL COMMENT '软删除用户ID';
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS last_sender_id INT UNSIGNED DEFAULT NULL COMMENT '最后发送者ID';
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS last_msg_type TINYINT DEFAULT 0 COMMENT '最后消息类型';

-- ====================================================================
-- 多重身份认证系统（任务1）
-- ====================================================================

-- 认证记录表
CREATE TABLE IF NOT EXISTS user_verifications (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL COMMENT '用户ID',
    verification_type ENUM('real_name', 'face', 'education', 'vehicle', 'income') NOT NULL COMMENT '认证类型',
    status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending' COMMENT '审核状态',
    real_name VARCHAR(50) DEFAULT NULL COMMENT '真实姓名',
    id_card_number VARCHAR(18) DEFAULT NULL COMMENT '身份证号',
    id_card_front_url VARCHAR(255) DEFAULT NULL COMMENT '身份证正面照URL',
    id_card_back_url VARCHAR(255) DEFAULT NULL COMMENT '身份证反面照URL',
    face_image_url VARCHAR(255) DEFAULT NULL COMMENT '人脸照片URL',
    face_video_url VARCHAR(255) DEFAULT NULL COMMENT '活体检测视频URL',
    school_name VARCHAR(100) DEFAULT NULL COMMENT '学校名称',
    education_level VARCHAR(20) DEFAULT NULL COMMENT '学历层次',
    graduation_year INT DEFAULT NULL COMMENT '毕业年份',
    education_cert_url VARCHAR(255) DEFAULT NULL COMMENT '学历证书URL',
    car_brand VARCHAR(50) DEFAULT NULL COMMENT '车辆品牌',
    car_model VARCHAR(50) DEFAULT NULL COMMENT '车辆型号',
    driving_license_url VARCHAR(255) DEFAULT NULL COMMENT '驾驶证URL',
    reviewed_by INT UNSIGNED DEFAULT NULL COMMENT '审核人ID',
    reviewed_at DATETIME DEFAULT NULL COMMENT '审核时间',
    rejected_reason VARCHAR(255) DEFAULT NULL COMMENT '拒绝原因',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    UNIQUE KEY uk_user_type (user_id, verification_type),
    INDEX idx_status (status),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户认证记录表';

-- users表新增认证字段
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_real_name_verified TINYINT(1) DEFAULT 0 COMMENT '是否实名认证';
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_face_verified TINYINT(1) DEFAULT 0 COMMENT '是否人脸认证';
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_education_verified TINYINT(1) DEFAULT 0 COMMENT '是否学历认证';
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_vehicle_verified TINYINT(1) DEFAULT 0 COMMENT '是否车辆认证';
ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_level TINYINT DEFAULT 0 COMMENT '认证等级(0-4)';
ALTER TABLE users ADD COLUMN IF NOT EXISTS verified_badges JSON DEFAULT NULL COMMENT '认证徽章列表';

-- ====================================================================
-- 语音/视频通话系统（任务3）
-- ====================================================================

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

-- 用户行为记录表
CREATE TABLE IF NOT EXISTS user_behaviors (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL COMMENT '行为发起用户ID',
    target_user_id INT UNSIGNED NOT NULL COMMENT '目标用户ID',
    action ENUM('view', 'like', 'skip', 'message', 'match', 'unmatch') NOT NULL COMMENT '行为类型',
    duration INT DEFAULT NULL COMMENT '停留时长（秒）',
    source VARCHAR(50) DEFAULT NULL COMMENT '来源页面',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    INDEX idx_user_action (user_id, action, created_at),
    INDEX idx_target (target_user_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (target_user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户行为记录表';

-- 用户兴趣画像表
CREATE TABLE IF NOT EXISTS user_interest_profiles (
    user_id INT UNSIGNED PRIMARY KEY COMMENT '用户ID',
    interest_vector JSON DEFAULT NULL COMMENT '兴趣标签向量',
    behavior_pattern JSON DEFAULT NULL COMMENT '行为模式统计',
    preference_age_min INT DEFAULT 18 COMMENT '偏好最小年龄',
    preference_age_max INT DEFAULT 35 COMMENT '偏好最大年龄',
    preference_distance INT DEFAULT 50 COMMENT '偏好距离(km)',
    preference_gender TINYINT(1) DEFAULT NULL COMMENT '偏好性别',
    last_active_at DATETIME DEFAULT NULL COMMENT '最后活跃时间',
    activity_score FLOAT DEFAULT 0 COMMENT '活跃度评分(0-100)',
    popularity_score FLOAT DEFAULT 0 COMMENT '受欢迎度评分(0-100)',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户兴趣画像表';
