-- 清理虚拟测试用户及其关联数据
-- 虚拟用户ID: 1,2,3,10,11,12,13,14,15,16
-- 保留真实用户: 4(管理员),5,6,7,8

-- 1. 备份users表
DROP TABLE IF EXISTS users_backup_20260721;
CREATE TABLE users_backup_20260721 AS SELECT * FROM users;

-- 2. 清理关联表（单向 user_id）
DELETE FROM user_photos WHERE user_id IN (1,2,3,10,11,12,13,14,15,16);
DELETE FROM user_settings WHERE user_id IN (1,2,3,10,11,12,13,14,15,16);
DELETE FROM user_badges WHERE user_id IN (1,2,3,10,11,12,13,14,15,16);
DELETE FROM user_daily_quotas WHERE user_id IN (1,2,3,10,11,12,13,14,15,16);
DELETE FROM user_dress_ups WHERE user_id IN (1,2,3,10,11,12,13,14,15,16);
DELETE FROM user_admin_notes WHERE user_id IN (1,2,3,10,11,12,13,14,15,16);
DELETE FROM user_verifications WHERE user_id IN (1,2,3,10,11,12,13,14,15,16);
DELETE FROM user_interest_profiles WHERE user_id IN (1,2,3,10,11,12,13,14,15,16);
DELETE FROM wallets WHERE user_id IN (1,2,3,10,11,12,13,14,15,16);
DELETE FROM daily_checkins WHERE user_id IN (1,2,3,10,11,12,13,14,15,16);
DELETE FROM user_tasks WHERE user_id IN (1,2,3,10,11,12,13,14,15,16);
DELETE FROM coin_transactions WHERE user_id IN (1,2,3,10,11,12,13,14,15,16);
DELETE FROM orders WHERE user_id IN (1,2,3,10,11,12,13,14,15,16);
DELETE FROM feedbacks WHERE user_id IN (1,2,3,10,11,12,13,14,15,16);
DELETE FROM push_tokens WHERE user_id IN (1,2,3,10,11,12,13,14,15,16);
DELETE FROM push_logs WHERE user_id IN (1,2,3,10,11,12,13,14,15,16);
DELETE FROM chat_backgrounds WHERE user_id IN (1,2,3,10,11,12,13,14,15,16);
DELETE FROM quick_replies WHERE user_id IN (1,2,3,10,11,12,13,14,15,16);
DELETE FROM user_tags WHERE user_id IN (1,2,3,10,11,12,13,14,15,16);

-- 3. 行为/浏览表（双向）
DELETE FROM user_behaviors WHERE user_id IN (1,2,3,10,11,12,13,14,15,16) OR target_user_id IN (1,2,3,10,11,12,13,14,15,16);
DELETE FROM user_views WHERE user_id IN (1,2,3,10,11,12,13,14,15,16) OR target_user_id IN (1,2,3,10,11,12,13,14,15,16);

-- 4. 关系类表（双向）
DELETE FROM likes WHERE user_id IN (1,2,3,10,11,12,13,14,15,16) OR target_user_id IN (1,2,3,10,11,12,13,14,15,16);
DELETE FROM skips WHERE user_id IN (1,2,3,10,11,12,13,14,15,16) OR target_user_id IN (1,2,3,10,11,12,13,14,15,16);
DELETE FROM user_blocks WHERE user_id IN (1,2,3,10,11,12,13,14,15,16) OR blocked_user_id IN (1,2,3,10,11,12,13,14,15,16);
DELETE FROM matches WHERE user1_id IN (1,2,3,10,11,12,13,14,15,16) OR user2_id IN (1,2,3,10,11,12,13,14,15,16);
DELETE FROM conversations WHERE user1_id IN (1,2,3,10,11,12,13,14,15,16) OR user2_id IN (1,2,3,10,11,12,13,14,15,16);
DELETE FROM intimacies WHERE user1_id IN (1,2,3,10,11,12,13,14,15,16) OR user2_id IN (1,2,3,10,11,12,13,14,15,16);
DELETE FROM anniversaries WHERE user1_id IN (1,2,3,10,11,12,13,14,15,16) OR user2_id IN (1,2,3,10,11,12,13,14,15,16);
DELETE FROM match_icebreakers WHERE user1_id IN (1,2,3,10,11,12,13,14,15,16) OR user2_id IN (1,2,3,10,11,12,13,14,15,16);

-- 5. 消息/通话/礼物（双向）
DELETE FROM messages WHERE sender_id IN (1,2,3,10,11,12,13,14,15,16) OR receiver_id IN (1,2,3,10,11,12,13,14,15,16);
DELETE FROM call_records WHERE caller_id IN (1,2,3,10,11,12,13,14,15,16) OR callee_id IN (1,2,3,10,11,12,13,14,15,16);
DELETE FROM gift_records WHERE sender_id IN (1,2,3,10,11,12,13,14,15,16) OR receiver_id IN (1,2,3,10,11,12,13,14,15,16);

-- 6. 亲密日志（actor_id）
DELETE FROM intimacy_logs WHERE actor_id IN (1,2,3,10,11,12,13,14,15,16);

-- 7. 动态相关
DELETE FROM post_likes WHERE user_id IN (1,2,3,10,11,12,13,14,15,16);
DELETE FROM post_comments WHERE user_id IN (1,2,3,10,11,12,13,14,15,16);
DELETE FROM post_favorites WHERE user_id IN (1,2,3,10,11,12,13,14,15,16);
DELETE FROM comment_likes WHERE user_id IN (1,2,3,10,11,12,13,14,15,16);
DELETE FROM posts WHERE user_id IN (1,2,3,10,11,12,13,14,15,16);

-- 8. 游戏
DELETE FROM game_records WHERE user_id IN (1,2,3,10,11,12,13,14,15,16) OR opponent_id IN (1,2,3,10,11,12,13,14,15,16);
DELETE FROM game_rooms WHERE player1_id IN (1,2,3,10,11,12,13,14,15,16) OR player2_id IN (1,2,3,10,11,12,13,14,15,16);

-- 9. 圈子
DELETE FROM community_members WHERE user_id IN (1,2,3,10,11,12,13,14,15,16);
DELETE FROM community_posts WHERE user_id IN (1,2,3,10,11,12,13,14,15,16);

-- 10. 举报（双向）
DELETE FROM reports WHERE reporter_id IN (1,2,3,10,11,12,13,14,15,16) OR reported_user_id IN (1,2,3,10,11,12,13,14,15,16);

-- 11. 最后删除用户
DELETE FROM users WHERE id IN (1,2,3,10,11,12,13,14,15,16);
