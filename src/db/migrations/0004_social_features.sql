-- =====================================================
-- 0004 社交衍生 seed 数据（贴纸 + 贵族装扮 + 破冰问题）
-- INSERT IGNORE 幂等，可重复执行
-- =====================================================

-- 贴纸（含 VIP 贴纸）
INSERT IGNORE INTO stickers (name, url, category, is_vip, is_active, sort_order) VALUES
('爱心', '/stickers/heart.png', '表情', 0, 1, 1),
('微笑', '/stickers/smile.png', '表情', 0, 1, 2),
('生气', '/stickers/angry.png', '表情', 0, 1, 3),
('惊讶', '/stickers/shock.png', '表情', 0, 1, 4),
('点赞', '/stickers/like.png', '动作', 0, 1, 5),
('抱抱', '/stickers/hug.png', '动作', 0, 1, 6),
('亲亲', '/stickers/kiss.png', '动作', 0, 1, 7),
('晚安', '/stickers/night.png', '日常', 0, 1, 8),
('玫瑰', '/stickers/rose.png', '礼物', 0, 1, 9),
('蛋糕', '/stickers/cake.png', '礼物', 0, 1, 10),
('钻石', '/stickers/diamond.png', 'VIP专属', 1, 1, 11),
('皇冠', '/stickers/crown.png', 'VIP专属', 1, 1, 12),
('豪车', '/stickers/car.png', 'VIP专属', 1, 1, 13),
('游艇', '/stickers/yacht.png', 'VIP专属', 1, 1, 14);

-- 贵族装扮商城（等级梯度：0 普通 / 1 骑士 / 2 子爵 / 3 伯爵）
INSERT IGNORE INTO dress_up_items (type, name, preview_url, resource_url, price, noble_level_required, is_active) VALUES
('avatar_frame', '粉色光环', '/dress/frame_pink.png', '/dress/frame_pink.png', 0, 1, 1),
('avatar_frame', '金色皇冠框', '/dress/frame_gold.png', '/dress/frame_gold.png', 500, 2, 1),
('avatar_frame', '钻石闪耀框', '/dress/frame_diamond.png', '/dress/frame_diamond.png', 1200, 3, 1),
('chat_bubble', '渐变气泡', '/dress/bubble_gradient.png', '/dress/bubble_gradient.png', 200, 1, 1),
('chat_bubble', '爱心气泡', '/dress/bubble_heart.png', '/dress/bubble_heart.png', 800, 3, 1),
('name_tag', '贵族铭牌', '/dress/tag_noble.png', '/dress/tag_noble.png', 300, 2, 1),
('name_tag', '闪耀铭牌', '/dress/tag_shine.png', '/dress/tag_shine.png', 1000, 3, 1);

-- 补充破冰趣味问题
INSERT IGNORE INTO icebreaker_questions (question, option_a, option_b, category) VALUES
('旅行最想去哪里？', '海边', '雪山', 'travel'),
('周末更喜欢？', '热闹聚会', '安静独处', 'lifestyle'),
('早餐吃什么？', '豆浆油条', '咖啡面包', 'food'),
('喜欢哪个季节？', '春天', '冬天', 'value');
