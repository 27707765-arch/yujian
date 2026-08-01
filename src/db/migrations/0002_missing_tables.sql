-- ============================================================
-- 遇见APP - 补充缺失建表脚本（幂等，可重复执行）
-- 用途：schema.sql / 早期迁移脚本未覆盖、但生产库已存在的表。
--       将生产库真实结构固化为仓库内脚本，保证新环境可重建。
-- 对应 model: Intimacy / Anniversary / IntimacyBadge /
--             UserDailyQuota / Sticker / Topic
-- 执行：mysql -u <user> -p <db> < src/db/add_missing_tables.sql
-- 注意：全部 CREATE TABLE IF NOT EXISTS，重复执行安全。
-- ============================================================

-- 亲密关系
CREATE TABLE IF NOT EXISTS `intimacies` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `user1_id` int unsigned NOT NULL,
  `user2_id` int unsigned NOT NULL,
  `score` int DEFAULT '0',
  `level` tinyint(1) DEFAULT '0',
  `consecutive_days` int DEFAULT '0',
  `total_chat_count` int DEFAULT '0',
  `total_call_duration` int DEFAULT '0',
  `total_gift_value` int DEFAULT '0',
  `last_interaction_at` datetime DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_users` (`user1_id`,`user2_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 亲密度变化日志
CREATE TABLE IF NOT EXISTS `intimacy_logs` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `intimacy_id` int unsigned NOT NULL,
  `actor_id` int unsigned NOT NULL,
  `action_type` varchar(20) NOT NULL,
  `score_change` int NOT NULL,
  `score_after` int NOT NULL,
  `detail` varchar(200) DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_intimacy_logs` (`intimacy_id`,`created_at` DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 纪念日
CREATE TABLE IF NOT EXISTS `anniversaries` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `user1_id` int unsigned NOT NULL,
  `user2_id` int unsigned NOT NULL,
  `event_type` varchar(30) NOT NULL,
  `event_date` date NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_users_event` (`user1_id`,`user2_id`,`event_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 亲密关系徽章定义
CREATE TABLE IF NOT EXISTS `intimacy_badges` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(50) NOT NULL,
  `description` varchar(200) DEFAULT NULL,
  `icon_url` varchar(255) DEFAULT NULL,
  `trigger_condition` varchar(100) NOT NULL,
  `badge_type` varchar(30) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 用户已解锁徽章
CREATE TABLE IF NOT EXISTS `user_badges` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int unsigned NOT NULL,
  `badge_id` int unsigned NOT NULL,
  `unlocked_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_badge` (`user_id`,`badge_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 用户每日操作配额
CREATE TABLE IF NOT EXISTS `user_daily_quotas` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int unsigned NOT NULL,
  `quota_date` date NOT NULL,
  `like_used` int DEFAULT '0',
  `super_like_used` int DEFAULT '0',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_date` (`user_id`,`quota_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 表情贴纸
CREATE TABLE IF NOT EXISTS `stickers` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(50) NOT NULL,
  `url` varchar(255) NOT NULL,
  `category` varchar(30) DEFAULT '普通',
  `is_vip` tinyint(1) DEFAULT '0',
  `is_active` tinyint(1) DEFAULT '1',
  `sort_order` int DEFAULT '0',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 话题
CREATE TABLE IF NOT EXISTS `topics` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(50) NOT NULL,
  `post_count` int DEFAULT '0',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 帖子-话题关联
CREATE TABLE IF NOT EXISTS `post_topics` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `post_id` int unsigned NOT NULL,
  `topic_id` int unsigned NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_post_topic` (`post_id`,`topic_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
