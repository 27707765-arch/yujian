-- =============================================================================
-- 文件名：add_performance_indexes.sql
-- 用途：为遇见APP数据库核心表添加性能优化索引
-- 适用：MySQL 8.0+
-- 用法：mysql -u root -p yujian < add_performance_indexes.sql
-- 安全：每个索引创建前检查 information_schema，已存在则跳过（幂等）
-- =============================================================================

USE yujian;

-- =============================================================================
-- 存储过程：条件创建索引（幂等，可重复执行）
-- 用法：CALL add_index_if_not_exists('表名', '索引名', '索引定义SQL');
-- =============================================================================
DELIMITER $$

DROP PROCEDURE IF EXISTS add_index_if_not_exists$$

CREATE PROCEDURE add_index_if_not_exists(
    IN tbl_name VARCHAR(64),
    IN idx_name VARCHAR(64),
    IN idx_def  VARCHAR(512)
)
BEGIN
    DECLARE idx_count INT DEFAULT 0;

    SELECT COUNT(*) INTO idx_count
    FROM information_schema.statistics
    WHERE table_schema = 'yujian'
      AND table_name   = tbl_name
      AND index_name   = idx_name;

    IF idx_count = 0 THEN
        SET @sql = CONCAT('ALTER TABLE `', tbl_name, '` ADD INDEX `', idx_name, '` ', idx_def);
        PREPARE stmt FROM @sql;
        EXECUTE stmt;
        DEALLOCATE PREPARE stmt;
        SELECT CONCAT('✅ ', tbl_name, '.', idx_name, ' — 创建成功') AS result;
    ELSE
        SELECT CONCAT('⏭️  ', tbl_name, '.', idx_name, ' — 已存在，跳过') AS result;
    END IF;
END$$

DELIMITER ;

-- =============================================================================
-- 1. messages 表：按会话ID查询消息列表（最新在前）
--    查询场景: SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at DESC
-- =============================================================================
CALL add_index_if_not_exists(
    'messages',
    'idx_messages_conv_created',
    '(conversation_id, created_at DESC)'
);

-- =============================================================================
-- 2. messages 表：未读消息统计（按接收者+未读状态）
--    查询场景: SELECT COUNT(*) FROM messages WHERE receiver_id = ? AND status = 0
--    也用于:   SELECT * FROM messages WHERE receiver_id = ? AND status = 0 ORDER BY created_at
-- =============================================================================
CALL add_index_if_not_exists(
    'messages',
    'idx_messages_receiver_status',
    '(receiver_id, status)'
);

-- =============================================================================
-- 3. posts 表：按用户ID查询动态列表（最新在前）
--    查询场景: SELECT * FROM posts WHERE user_id = ? ORDER BY created_at DESC
--    admin场景: SELECT * FROM posts WHERE user_id = ? AND status = ? ORDER BY created_at DESC
-- =============================================================================
CALL add_index_if_not_exists(
    'posts',
    'idx_posts_user_created',
    '(user_id, created_at DESC)'
);

-- =============================================================================
-- 4. gift_records 表：收礼记录查询（按接收者+时间倒序）
--    查询场景: SELECT * FROM gift_records WHERE receiver_id = ? ORDER BY created_at DESC
-- =============================================================================
CALL add_index_if_not_exists(
    'gift_records',
    'idx_gift_records_receiver_created',
    '(receiver_id, created_at DESC)'
);

-- =============================================================================
-- 5. gift_records 表：送礼记录查询（按发送者+时间倒序）
--    查询场景: SELECT * FROM gift_records WHERE sender_id = ? ORDER BY created_at DESC
-- =============================================================================
CALL add_index_if_not_exists(
    'gift_records',
    'idx_gift_records_sender_created',
    '(sender_id, created_at DESC)'
);

-- =============================================================================
-- 6. coin_transactions 表：用户交易流水查询（按用户+时间倒序）
--    查询场景: SELECT * FROM coin_transactions WHERE user_id = ? ORDER BY created_at DESC
-- =============================================================================
CALL add_index_if_not_exists(
    'coin_transactions',
    'idx_coin_tx_user_created',
    '(user_id, created_at DESC)'
);

-- =============================================================================
-- 7. coin_transactions 表：按用户+类型查询流水
--    查询场景: SELECT * FROM coin_transactions WHERE user_id = ? AND type = ? ORDER BY created_at DESC
--    admin场景: SELECT * FROM coin_transactions WHERE user_id = ? AND type = ? AND created_at BETWEEN ? AND ?
-- =============================================================================
CALL add_index_if_not_exists(
    'coin_transactions',
    'idx_coin_tx_user_type',
    '(user_id, type)'
);

-- =============================================================================
-- 8. daily_checkins 表：签到历史查询（按用户+日期倒序）
--    查询场景: SELECT * FROM daily_checkins WHERE user_id = ? ORDER BY checkin_date DESC
--    注：该表已有 UNIQUE KEY uk_user_date (user_id, checkin_date)，但排序方向未指定。
--        此索引补充 DESC 排序优化，与唯一约束共存（MySQL 允许同列集合的不同索引）
--        如果优化器已使用 uk_user_date 则跳过。
-- =============================================================================
CALL add_index_if_not_exists(
    'daily_checkins',
    'idx_checkins_user_date_desc',
    '(user_id, checkin_date DESC)'
);

-- =============================================================================
-- 9. user_tasks 表：每日任务查询（按用户+日期倒序+任务键）
--    查询场景: SELECT * FROM user_tasks WHERE user_id = ? ORDER BY task_date DESC, task_key
--    注：该表已有 UNIQUE KEY uk_user_task_date (user_id, task_key, task_date)，
--        但排序方向未指定 DESC。此索引优化按日期倒序查询。
-- =============================================================================
CALL add_index_if_not_exists(
    'user_tasks',
    'idx_tasks_user_date_task',
    '(user_id, task_date DESC, task_key)'
);

-- =============================================================================
-- 10. posts 表：全站动态时间线（按状态+时间倒序）
--    查询场景: SELECT * FROM posts WHERE status = 1 ORDER BY created_at DESC
-- =============================================================================
CALL add_index_if_not_exists(
    'posts',
    'idx_posts_status_created',
    '(status, created_at DESC)'
);

-- =============================================================================
-- 11. post_comments 表：动态评论列表（按帖子+时间）
--    查询场景: SELECT * FROM post_comments WHERE post_id = ? ORDER BY created_at
-- =============================================================================
CALL add_index_if_not_exists(
    'post_comments',
    'idx_comments_post_created',
    '(post_id, created_at)'
);

-- =============================================================================
-- 12. likes 表：反向匹配查询（查询谁喜欢了我）
--    查询场景: SELECT * FROM likes WHERE target_user_id = ?
--    注：uk_user_target (user_id, target_user_id) 无法高效覆盖反向查询
-- =============================================================================
CALL add_index_if_not_exists(
    'likes',
    'idx_likes_target_user',
    '(target_user_id)'
);

-- =============================================================================
-- 13. messages 表：接收者消息时间线（不含status条件时使用）
--    查询场景: SELECT * FROM messages WHERE receiver_id = ? ORDER BY created_at DESC
--    与 idx_messages_receiver_status 互补，覆盖不筛选status的排序查询
-- =============================================================================
CALL add_index_if_not_exists(
    'messages',
    'idx_messages_receiver_created',
    '(receiver_id, created_at DESC)'
);

-- =============================================================================
-- 14. reports 表：管理员查看待处理举报
--    查询场景: SELECT * FROM reports WHERE status = 0 ORDER BY created_at DESC
-- =============================================================================
CALL add_index_if_not_exists(
    'reports',
    'idx_reports_status_created',
    '(status, created_at)'
);

-- =============================================================================
-- 15. coin_transactions 表：后台对账时间范围查询
--    查询场景: SELECT * FROM coin_transactions WHERE created_at BETWEEN ? AND ?
-- =============================================================================
CALL add_index_if_not_exists(
    'coin_transactions',
    'idx_trans_created',
    '(created_at)'
);

-- =============================================================================
-- 16. gift_records 表：按会话查询礼物
--    查询场景: SELECT * FROM gift_records WHERE conversation_id = ?
-- =============================================================================
CALL add_index_if_not_exists(
    'gift_records',
    'idx_gift_records_conv',
    '(conversation_id)'
);

-- =============================================================================
-- 17. push_logs 表：推送日志按状态+时间筛选
--    查询场景: SELECT * FROM push_logs WHERE status = ? AND created_at < ?
-- =============================================================================
CALL add_index_if_not_exists(
    'push_logs',
    'idx_push_status_created',
    '(status, created_at)'
);

-- =============================================================================
-- 18. conversations 表：用户会话列表查询（user1_id 方向上来了）
--    查询场景: SELECT * FROM conversations WHERE user1_id = ? ORDER BY updated_at DESC
-- =============================================================================
CALL add_index_if_not_exists(
    'conversations',
    'idx_conv_user1',
    '(user1_id)'
);

-- =============================================================================
-- 19. conversations 表：用户会话列表查询（user2_id 方向）
--    查询场景: SELECT * FROM conversations WHERE user2_id = ? ORDER BY updated_at DESC
-- =============================================================================
CALL add_index_if_not_exists(
    'conversations',
    'idx_conv_user2',
    '(user2_id)'
);

-- =============================================================================
-- 20. user_views 表：查看我的浏览记录
--    查询场景: SELECT * FROM user_views WHERE user_id = ? ORDER BY created_at DESC
-- =============================================================================
CALL add_index_if_not_exists(
    'user_views',
    'idx_views_user_created',
    '(user_id, created_at DESC)'
);

-- =============================================================================
-- 清理存储过程（可选：保留以便后续添加更多索引）
-- DROP PROCEDURE IF EXISTS add_index_if_not_exists;
-- =============================================================================

-- =============================================================================
-- 验证：查看所有已创建的索引
-- =============================================================================
SELECT
    TABLE_NAME AS '表名',
    INDEX_NAME AS '索引名',
    GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS '索引列',
    NON_UNIQUE AS '非唯一',
    INDEX_TYPE AS '类型'
FROM information_schema.statistics
WHERE table_schema = 'yujian'
  AND INDEX_NAME LIKE 'idx_%'
GROUP BY TABLE_NAME, INDEX_NAME, NON_UNIQUE, INDEX_TYPE
ORDER BY TABLE_NAME, INDEX_NAME;

SELECT '✅ 性能索引添加完成！' AS result;
