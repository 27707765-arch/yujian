# 遇见APP功能增强 - Claude Code完整提示词清单
# 使用方法：将每个任务单独复制给Claude Code执行
# 项目路径：E:\项目文件\APP\yujian

---

## 任务1: 消息类型扩展 ✅ (2026-07-21 完成并部署)

### 状态：✅ 已完成

在遇见社交APP中扩展消息类型，当前仅支持文字(type=0)和图片(type=1)消息。

### 需求说明
请为聊天系统添加以下消息类型支持：

1. **语音消息 (type=2)**
   - 用户可以录制并发送语音消息
   - 语音文件存储在uploads/voice/目录
   - 需要记录语音时长(duration字段)
   - 语音消息content字段存储文件URL

2. **视频消息 (type=3)**
   - 用户可以发送短视频消息
   - 视频文件存储在uploads/video/目录
   - 需要记录视频时长和封面图
   - 视频消息content字段存储视频URL

3. **表情包消息 (type=4)**
   - 支持发送系统表情包
   - content字段存储表情包ID或URL
   - 创建表情包表存储表情包信息

4. **位置消息 (type=5)**
   - 用户可以分享位置信息
   - content字段存储JSON格式：{lat, lng, address, name}
   - 前端可解析并显示地图

5. **礼物消息 (type=6)**
   - 在聊天中发送礼物时自动生成
   - content字段存储礼物信息JSON
   - 显示礼物动画效果

### 数据库修改
```sql
-- 扩展messages表的type字段说明
-- type: 0-文字, 1-图片, 2-语音, 3-视频, 4-表情包, 5-位置, 6-礼物

-- 新增表情包表
CREATE TABLE IF NOT EXISTS stickers (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(50) NOT NULL COMMENT '表情包名称',
    category VARCHAR(30) DEFAULT NULL COMMENT '分类',
    url VARCHAR(255) NOT NULL COMMENT '图片URL',
    is_free TINYINT(1) DEFAULT 1 COMMENT '是否免费',
    price DECIMAL(10,2) DEFAULT 0 COMMENT '价格',
    sort_order INT DEFAULT 0 COMMENT '排序',
    status TINYINT(1) DEFAULT 1 COMMENT '状态',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_category (category),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### 文件修改清单
- 修改 `src/models/Message.js` - 支持新消息类型
- 修改 `src/services/upload.service.js` - 支持语音/视频上传
- 修改 `websocket-server.js` - 处理新消息类型
- 新增 `src/routes/sticker.routes.js` - 表情包管理API
- 新增 `src/models/Sticker.js` - 表情包模型

---

## 任务2: 动态广场增强 ✅ (2026-07-21 完成并部署)

增强遇见APP的动态广场功能，添加话题标签、热门推荐、附近动态等特性。

### 需求说明

1. **话题标签系统**
   - 发布动态时可以添加#话题#标签
   - 自动识别内容中的话题标签并提取
   - 创建话题表，记录话题使用次数
   - 支持按话题查看相关动态
   - 热门话题排行榜

2. **热门动态推荐**
   - 基于点赞数、评论数、发布时间计算热度分数
   - 热度公式：score = (likes*3 + comments*2) / (hours_since_publish + 2)^1.5
   - 首页默认显示热门动态
   - 支持切换：热门/最新/关注

3. **附近动态**
   - 基于用户地理位置推荐附近动态
   - 使用经纬度计算距离
   - 默认范围50km内
   - 按距离+热度综合排序

4. **动态收藏功能**
   - 用户可以收藏动态
   - 收藏列表页面
   - 收藏数量统计

5. **动态转发功能**
   - 支持转发动态到自己的主页
   - 转发时可以添加评论
   - 显示原动态引用

### 数据库设计
```sql
-- 话题表
CREATE TABLE IF NOT EXISTS topics (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE COMMENT '话题名称',
    post_count INT DEFAULT 0 COMMENT '动态数量',
    view_count INT DEFAULT 0 COMMENT '浏览次数',
    hot_score FLOAT DEFAULT 0 COMMENT '热度分数',
    cover_url VARCHAR(255) DEFAULT NULL COMMENT '封面图',
    status TINYINT(1) DEFAULT 1 COMMENT '状态',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_hot_score (hot_score DESC),
    INDEX idx_post_count (post_count DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 动态话题关联表
CREATE TABLE IF NOT EXISTS post_topics (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    post_id INT UNSIGNED NOT NULL,
    topic_id INT UNSIGNED NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_post_topic (post_id, topic_id),
    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
    FOREIGN KEY (topic_id) REFERENCES topics(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 动态收藏表
CREATE TABLE IF NOT EXISTS post_favorites (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    post_id INT UNSIGNED NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_user_post (user_id, post_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- posts表新增字段
ALTER TABLE posts ADD COLUMN IF NOT EXISTS topic_names JSON DEFAULT NULL COMMENT '话题名称列表';
ALTER TABLE posts ADD COLUMN IF NOT EXISTS hot_score FLOAT DEFAULT 0 COMMENT '热度分数';
ALTER TABLE posts ADD COLUMN IF NOT EXISTS favorite_count INT DEFAULT 0 COMMENT '收藏数';
ALTER TABLE posts ADD COLUMN IF NOT EXISTS repost_count INT DEFAULT 0 COMMENT '转发数';
ALTER TABLE posts ADD COLUMN IF NOT EXISTS original_post_id INT UNSIGNED DEFAULT NULL COMMENT '原动态ID(转发)';
ALTER TABLE posts ADD COLUMN IF NOT EXISTS repost_comment VARCHAR(500) DEFAULT NULL COMMENT '转发评论';
```

### API设计
```
GET  /api/posts/topics/hot          - 获取热门话题
GET  /api/posts/topics/:name        - 获取话题详情和相关动态
GET  /api/posts/hot                 - 获取热门动态
GET  /api/posts/nearby?lat=&lng=&distance= - 获取附近动态
POST /api/posts/:id/favorite        - 收藏/取消收藏
GET  /api/posts/favorites           - 我的收藏列表
POST /api/posts/:id/repost          - 转发动态
```

### 文件修改清单
- 修改 `src/models/Post.js` - 添加话题、收藏、转发支持
- 修改 `src/controllers/post.controller.js` - 添加新接口
- 新增 `src/models/Topic.js` - 话题模型
- 新增 `src/services/topic.service.js` - 话题提取和服务
- 修改 `schema.sql` - 添加新表结构

---

## 任务3: 智能破冰系统 ✅ (2026-07-21 完成并部署)

为遇见APP添加智能破冰功能，帮助用户在匹配后快速破冰聊天。

### 需求说明

1. **AI话题助手**
   - 基于双方用户资料（兴趣标签、职业、位置、年龄）自动生成破冰话题
   - 每次匹配成功后生成3-5个推荐话题
   - 话题类型：共同兴趣、同城话题、职业相关、趣味问题
   - 话题可以直接一键发送

2. **蒙面匹配模式**
   - 匹配初期只显示部分信息（年龄范围、城市、共同兴趣）
   - 隐藏头像和具体资料
   - 通过聊天逐步解锁对方信息
   - 解锁条件：聊天达到一定消息数或时间

3. **问答互动**
   - 提供趣味问答题目
   - 双方各自回答，答案揭晓后产生话题
   - 问题类型：价值观、兴趣爱好、生活态度

4. **破冰话术推荐**
   - 根据对方资料推荐开场白
   - 支持自定义常用开场白
   - 记录哪些开场白回复率高

### 数据库设计
```sql
-- 破冰话题表
CREATE TABLE IF NOT EXISTS icebreaker_topics (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    category ENUM('interest', 'location', 'occupation', 'fun', 'value') NOT NULL,
    content VARCHAR(200) NOT NULL COMMENT '话题内容',
    is_active TINYINT(1) DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_category (category)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 匹配破冰记录表
CREATE TABLE IF NOT EXISTS match_icebreakers (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    match_id INT UNSIGNED NOT NULL,
    user1_id INT UNSIGNED NOT NULL,
    user2_id INT UNSIGNED NOT NULL,
    topics JSON DEFAULT NULL COMMENT '推荐话题列表',
    mask_level INT DEFAULT 0 COMMENT '蒙面等级0-5，5为完全解锁',
    unlock_progress JSON DEFAULT NULL COMMENT '解锁进度',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_match (match_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 趣味问答题目表
CREATE TABLE IF NOT EXISTS icebreaker_questions (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    question VARCHAR(200) NOT NULL,
    option_a VARCHAR(100) NOT NULL,
    option_b VARCHAR(100) NOT NULL,
    category VARCHAR(30) DEFAULT NULL,
    is_active TINYINT(1) DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### API设计
```
GET  /api/icebreaker/topics/:matchId    - 获取匹配的破冰话题
POST /api/icebreaker/send-topic         - 发送破冰话题
GET  /api/icebreaker/mask-status/:matchId - 获取蒙面状态
POST /api/icebreaker/answer-question    - 回答趣味问题
GET  /api/icebreaker/question/random    - 获取随机问题
```

### 文件修改清单
- 新增 `src/controllers/icebreaker.controller.js`
- 新增 `src/routes/icebreaker.routes.js`
- 新增 `src/models/MatchIcebreaker.js`
- 新增 `src/services/icebreaker.service.js`
- 修改 `src/models/Match.js` - 匹配成功时创建破冰记录
- 新增 `src/db/add_icebreaker_tables.sql`

---

## 任务4: 亲密印记系统 ✅ (2026-07-21 完成并部署)

为遇见APP添加亲密印记功能，记录用户之间的关系发展历程。

### 需求说明

1. **关系等级系统**
   - 五个等级：初识(0-99) → 心动(100-299) → 暧昧(300-599) → 恋人(600-999) → 挚爱(1000+)
   - 亲密度通过以下行为积累：
     - 聊天消息：每条+1
     - 语音通话：每分钟+2
     - 视频通话：每分钟+3
     - 送礼物：根据礼物价值+1~+10
     - 每日互动：首次互动+5
     - 连续互动：连续7天+20，连续30天+50

2. **亲密度展示**
   - 聊天页面显示亲密度等级和进度条
   - 等级提升时发送系统消息通知
   - 解锁专属特权（如专属聊天背景、专属表情）

3. **纪念日记录**
   - 自动记录重要时刻：
     - 首次匹配时间
     - 首次聊天时间
     - 关系升级时间
     - 首次通话时间
   - 纪念日提醒通知

4. **专属徽章**
   - 根据关系成就解锁徽章
   - 徽章类型：初次相遇、话唠达人、甜蜜恋人等
   - 徽章可在个人主页展示

### 数据库设计
```sql
-- 关系记录表
CREATE TABLE IF NOT EXISTS relationships (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user1_id INT UNSIGNED NOT NULL,
    user2_id INT UNSIGNED NOT NULL,
    intimacy_score INT DEFAULT 0 COMMENT '亲密度分数',
    level TINYINT DEFAULT 1 COMMENT '等级1-5',
    matched_at DATETIME DEFAULT NULL COMMENT '匹配时间',
    first_chat_at DATETIME DEFAULT NULL COMMENT '首次聊天',
    first_call_at DATETIME DEFAULT NULL COMMENT '首次通话',
    last_interaction_at DATETIME DEFAULT NULL COMMENT '最后互动',
    consecutive_days INT DEFAULT 0 COMMENT '连续互动天数',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_users (user1_id, user2_id),
    FOREIGN KEY (user1_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (user2_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 亲密度日志表
CREATE TABLE IF NOT EXISTS intimacy_logs (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    relationship_id INT UNSIGNED NOT NULL,
    user_id INT UNSIGNED NOT NULL,
    action VARCHAR(30) NOT NULL COMMENT '行为类型',
    score_change INT NOT NULL COMMENT '分数变化',
    description VARCHAR(100) DEFAULT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_relationship (relationship_id),
    FOREIGN KEY (relationship_id) REFERENCES relationships(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 纪念日表
CREATE TABLE IF NOT EXISTS anniversaries (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    relationship_id INT UNSIGNED NOT NULL,
    type VARCHAR(30) NOT NULL COMMENT '纪念日类型',
    title VARCHAR(50) NOT NULL,
    happened_at DATETIME NOT NULL,
    is_notified TINYINT(1) DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_relationship (relationship_id),
    FOREIGN KEY (relationship_id) REFERENCES relationships(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 徽章表
CREATE TABLE IF NOT EXISTS badges (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE,
    icon_url VARCHAR(255) NOT NULL,
    description VARCHAR(200) DEFAULT NULL,
    condition_type VARCHAR(30) NOT NULL COMMENT '获取条件类型',
    condition_value INT DEFAULT NULL COMMENT '条件值',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 用户徽章表
CREATE TABLE IF NOT EXISTS user_badges (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    badge_id INT UNSIGNED NOT NULL,
    unlocked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_user_badge (user_id, badge_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (badge_id) REFERENCES badges(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### API设计
```
GET  /api/relationship/:targetUserId           - 获取关系详情
GET  /api/relationship/:targetUserId/logs      - 获取亲密度日志
GET  /api/relationship/:targetUserId/anniversaries - 获取纪念日列表
GET  /api/relationship/badges                  - 获取我的徽章
POST /api/relationship/add-intimacy            - 添加亲密度(内部调用)
```

### 文件修改清单
- 新增 `src/controllers/relationship.controller.js`
- 新增 `src/routes/relationship.routes.js`
- 新增 `src/models/Relationship.js`
- 新增 `src/models/Anniversary.js`
- 新增 `src/models/Badge.js`
- 新增 `src/services/relationship.service.js`
- 修改 `src/services/chat.controller.js` - 发送消息时增加亲密度
- 新增 `src/db/add_relationship_tables.sql`

---

## 任务5: 社交游戏功能 ✅ (2026-07-21 完成并部署)

为遇见APP添加双人社交小游戏，增强用户互动和粘性。

### 需求说明

1. **猜词游戏**
   - 一方出题，另一方猜词
   - 提供字母提示
   - 限时60秒
   - 猜对双方获得亲密度奖励

2. **五子棋游戏**
   - 经典五子棋对战
   - 实时对弈（通过WebSocket）
   - 记录胜负和连胜

3. **问答PK**
   - 双方同时回答问题
   - 比拼答题速度和正确率
   - 支持多种题库

4. **每日任务**
   - 每日游戏任务（玩一局游戏）
   - 完成任务获得金币奖励
   - 游戏排行榜

### 数据库设计
```sql
-- 游戏房间表
CREATE TABLE IF NOT EXISTS game_rooms (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    game_type ENUM('guess_word', 'gomoku', 'quiz') NOT NULL,
    player1_id INT UNSIGNED NOT NULL,
    player2_id INT UNSIGNED NOT NULL,
    status ENUM('waiting', 'playing', 'finished') DEFAULT 'waiting',
    winner_id INT UNSIGNED DEFAULT NULL,
    game_data JSON DEFAULT NULL COMMENT '游戏状态数据',
    started_at DATETIME DEFAULT NULL,
    ended_at DATETIME DEFAULT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_player1 (player1_id),
    INDEX idx_player2 (player2_id),
    FOREIGN KEY (player1_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (player2_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 游戏记录表
CREATE TABLE IF NOT EXISTS game_records (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    game_type VARCHAR(20) NOT NULL,
    result ENUM('win', 'lose', 'draw') NOT NULL,
    score INT DEFAULT 0,
    opponent_id INT UNSIGNED DEFAULT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_user_type (user_id, game_type),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 猜词词库表
CREATE TABLE IF NOT EXISTS guess_words (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    word VARCHAR(50) NOT NULL,
    hint VARCHAR(200) DEFAULT NULL,
    difficulty TINYINT DEFAULT 1 COMMENT '难度1-3',
    category VARCHAR(30) DEFAULT NULL,
    is_active TINYINT(1) DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### API设计
```
POST /api/game/create              - 创建游戏房间
POST /api/game/join/:roomId        - 加入游戏房间
POST /api/game/move                - 游戏操作（落子/猜词/答题）
GET  /api/game/record              - 获取游戏记录
GET  /api/game/leaderboard         - 获取排行榜
GET  /api/game/daily-task          - 获取每日游戏任务
```

### WebSocket消息类型
```
game_invite     - 游戏邀请
game_accept     - 接受邀请
game_reject     - 拒绝邀请
game_move       - 游戏操作
game_over       - 游戏结束
```

### 文件修改清单
- 新增 `src/controllers/game.controller.js`
- 新增 `src/routes/game.routes.js`
- 新增 `src/models/GameRoom.js`
- 新增 `src/models/GameRecord.js`
- 新增 `src/services/game.service.js`
- 修改 `websocket-server.js` - 添加游戏信令处理
- 新增 `src/db/add_game_tables.sql`

---

## 任务6: 社群/圈子功能 ✅ (2026-07-21 完成并部署)

为遇见APP添加兴趣圈子功能，让用户基于共同兴趣聚集交流。

### 需求说明

1. **圈子创建与管理**
   - 用户可以创建兴趣圈子
   - 设置圈子名称、简介、封面、标签
   - 圈主可以设置管理员
   - 支持设置加入条件（自由加入/需要审核/邀请制）

2. **圈子成员管理**
   - 成员列表查看
   - 成员等级：普通成员 → 管理员 → 圈主
   - 踢人/禁言功能
   - 成员贡献度统计

3. **圈子动态**
   - 圈子内发布动态（仅圈子成员可见）
   - 圈子专属话题
   - 精华帖置顶

4. **圈子活动**
   - 圈主/管理员可以发起活动
   - 活动报名参与
   - 活动提醒通知

5. **圈子发现**
   - 推荐圈子（基于用户兴趣标签）
   - 热门圈子排行榜
   - 搜索圈子

### 数据库设计
```sql
-- 圈子表
CREATE TABLE IF NOT EXISTS communities (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(50) NOT NULL,
    description VARCHAR(500) DEFAULT NULL,
    cover_url VARCHAR(255) DEFAULT NULL,
    creator_id INT UNSIGNED NOT NULL,
    member_count INT DEFAULT 1,
    post_count INT DEFAULT 0,
    tags JSON DEFAULT NULL,
    join_type ENUM('free', 'audit', 'invite') DEFAULT 'free',
    status TINYINT(1) DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_creator (creator_id),
    INDEX idx_member_count (member_count DESC),
    FOREIGN KEY (creator_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 圈子成员表
CREATE TABLE IF NOT EXISTS community_members (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    community_id INT UNSIGNED NOT NULL,
    user_id INT UNSIGNED NOT NULL,
    role ENUM('member', 'admin', 'owner') DEFAULT 'member',
    contribution_score INT DEFAULT 0,
    joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_community_user (community_id, user_id),
    FOREIGN KEY (community_id) REFERENCES communities(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 圈子动态表
CREATE TABLE IF NOT EXISTS community_posts (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    community_id INT UNSIGNED NOT NULL,
    user_id INT UNSIGNED NOT NULL,
    content TEXT NOT NULL,
    images JSON DEFAULT NULL,
    like_count INT DEFAULT 0,
    comment_count INT DEFAULT 0,
    is_pinned TINYINT(1) DEFAULT 0,
    is_essence TINYINT(1) DEFAULT 0,
    status TINYINT(1) DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_community (community_id, created_at DESC),
    FOREIGN KEY (community_id) REFERENCES communities(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 圈子活动表
CREATE TABLE IF NOT EXISTS community_events (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    community_id INT UNSIGNED NOT NULL,
    creator_id INT UNSIGNED NOT NULL,
    title VARCHAR(100) NOT NULL,
    description TEXT,
    location VARCHAR(200) DEFAULT NULL,
    start_time DATETIME NOT NULL,
    end_time DATETIME DEFAULT NULL,
    max_participants INT DEFAULT NULL,
    participant_count INT DEFAULT 0,
    status TINYINT(1) DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (community_id) REFERENCES communities(id) ON DELETE CASCADE,
    FOREIGN KEY (creator_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 活动报名表
CREATE TABLE IF NOT EXISTS community_event_participants (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    event_id INT UNSIGNED NOT NULL,
    user_id INT UNSIGNED NOT NULL,
    status ENUM('registered', 'attended', 'cancelled') DEFAULT 'registered',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_event_user (event_id, user_id),
    FOREIGN KEY (event_id) REFERENCES community_events(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### API设计
```
POST /api/community/create                    - 创建圈子
GET  /api/community/list                      - 获取圈子列表
GET  /api/community/:id                       - 获取圈子详情
PUT  /api/community/:id                       - 更新圈子信息
POST /api/community/:id/join                  - 加入圈子
POST /api/community/:id/leave                 - 退出圈子
GET  /api/community/:id/members               - 获取成员列表
PUT  /api/community/:id/member/:userId/role   - 修改成员角色
POST /api/community/:id/post                  - 发布圈子动态
GET  /api/community/:id/posts                 - 获取圈子动态
POST /api/community/:id/event                 - 创建活动
GET  /api/community/:id/events                - 获取活动列表
POST /api/community/event/:eventId/join       - 报名活动
GET  /api/community/recommend                 - 推荐圈子
GET  /api/community/hot                       - 热门圈子
GET  /api/community/search?q=                 - 搜索圈子
```

### 文件修改清单
- 新增 `src/controllers/community.controller.js`
- 新增 `src/routes/community.routes.js`
- 新增 `src/models/Community.js`
- 新增 `src/models/CommunityMember.js`
- 新增 `src/models/CommunityPost.js`
- 新增 `src/models/CommunityEvent.js`
- 新增 `src/services/community.service.js`
- 新增 `src/db/add_community_tables.sql`

---

## 任务7: 聊天体验优化 ✅ (2026-07-21 完成并部署)

优化遇见APP的聊天体验，添加更多实用功能。

### 需求说明

1. **聊天背景自定义**
   - 用户可以为每个聊天设置不同背景
   - 提供系统默认背景图库
   - 支持上传自定义背景

2. **历史消息搜索**
   - 支持搜索聊天记录中的文字内容
   - 按关键词高亮显示
   - 支持按时间范围筛选

3. **快捷回复**
   - 用户可以设置常用快捷回复语
   - 聊天时一键发送
   - 提供系统默认快捷回复

4. **消息引用回复**
   - 长按消息可以引用回复
   - 显示被引用消息的摘要
   - 点击引用可以跳转到原消息

5. **消息批量操作**
   - 支持批量选择消息
   - 批量删除
   - 批量转发

### 数据库设计
```sql
-- 聊天背景表
CREATE TABLE IF NOT EXISTS chat_backgrounds (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    conversation_id INT UNSIGNED NOT NULL,
    background_url VARCHAR(255) NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_user_conv (user_id, conversation_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 快捷回复表
CREATE TABLE IF NOT EXISTS quick_replies (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    content VARCHAR(200) NOT NULL,
    sort_order INT DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_user (user_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- messages表新增字段
ALTER TABLE messages ADD COLUMN IF NOT EXISTS quoted_message_id INT UNSIGNED DEFAULT NULL COMMENT '引用消息ID';
ALTER TABLE messages ADD COLUMN IF NOT EXISTS quoted_content VARCHAR(200) DEFAULT NULL COMMENT '引用消息内容摘要';
```

### API设计
```
PUT  /api/chat/conversation/:id/background    - 设置聊天背景
GET  /api/chat/conversation/:id/background    - 获取聊天背景
GET  /api/chat/search?keyword=&conversationId= - 搜索聊天记录
POST /api/chat/quick-reply                    - 添加快捷回复
GET  /api/chat/quick-replies                  - 获取快捷回复列表
DELETE /api/chat/quick-reply/:id              - 删除快捷回复
POST /api/chat/messages/batch-delete          - 批量删除消息
POST /api/chat/messages/batch-forward         - 批量转发消息
```

### 文件修改清单
- 修改 `src/models/Message.js` - 支持引用回复
- 修改 `src/controllers/chat.controller.js` - 添加新接口
- 新增 `src/models/ChatBackground.js`
- 新增 `src/models/QuickReply.js`
- 新增 `src/db/add_chat_enhancement.sql`

---

## 任务8: 匹配体验优化 ✅ (2026-07-21 完成并部署)

优化遇见APP的匹配体验，参考探探等应用的交互方式。

### 需求说明

1. **卡片式滑动交互**
   - 用户资料以卡片形式展示
   - 左滑跳过，右滑喜欢
   - 上滑超级喜欢（需要消耗金币）
   - 卡片堆叠效果，显示3张卡片

2. **动画效果**
   - 喜欢时显示红色爱心动画
   - 跳过时显示灰色X动画
   - 匹配成功时显示双方头像+特效
   - 超级喜欢时显示金色星星动画

3. **即时反馈**
   - 滑动后立即显示下一个推荐
   - 预加载下一批推荐用户（提前5个开始加载）
   - 支持撤销上一次滑动（3秒内可撤销）

4. **每日限量**
   - 普通用户每日免费喜欢次数：20次
   - VIP用户：无限次
   - 每日重置时间：00:00

5. **超级喜欢**
   - 消耗10金币
   - 对方会收到特别通知
   - 优先显示在对方的推荐列表中

### 数据库设计
```sql
-- 滑动记录表（用于撤销功能）
CREATE TABLE IF NOT EXISTS swipe_records (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    target_user_id INT UNSIGNED NOT NULL,
    action ENUM('like', 'skip', 'super_like') NOT NULL,
    is_undone TINYINT(1) DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_user_created (user_id, created_at DESC),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (target_user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 每日配额表
CREATE TABLE IF NOT EXISTS daily_quotas (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    quota_date DATE NOT NULL,
    like_count INT DEFAULT 0,
    super_like_count INT DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_user_date (user_id, quota_date),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- users表新增字段
ALTER TABLE users ADD COLUMN IF NOT EXISTS swipe_daily_limit INT DEFAULT 20 COMMENT '每日滑动限制';
```

### API设计
```
POST /api/match/swipe                 - 滑动操作（like/skip/super_like）
POST /api/match/undo                  - 撤销上一次滑动
GET  /api/match/quota                 - 获取今日剩余配额
GET  /api/match/recommend-v2          - 获取卡片式推荐列表（新版本）
```

### WebSocket消息
```
match_success      - 匹配成功（带特效参数）
super_like_notify  - 收到超级喜欢通知
```

### 文件修改清单
- 修改 `src/controllers/match.controller.js` - 添加滑动和撤销接口
- 修改 `src/services/match.service.js` - 添加配额检查和滑动记录
- 新增 `src/models/SwipeRecord.js`
- 新增 `src/models/DailyQuota.js`
- 修改 `websocket-server.js` - 处理匹配成功特效
- 新增 `src/db/add_swipe_tables.sql`

---

## 任务9: VIP体系增强 ✅ (2026-07-21 完成并部署)

增强遇见APP的VIP体系，添加多级贵族和装扮商城功能。

### 需求说明

1. **多级贵族体系**
   - 五个等级：骑士(¥30/月) → 子爵(¥68/月) → 伯爵(¥128/月) → 侯爵(¥328/月) → 公爵(¥648/月)
   - 每个等级有不同的特权
   - 等级可以叠加（充值累加）

2. **贵族特权配置**
   - 骑士：每日喜欢50次、专属标识
   - 子爵：无限喜欢、查看谁喜欢我、优先推荐
   - 伯爵：超级喜欢3次/天、已读回执、隐身浏览
   - 侯爵：超级喜欢10次/天、专属客服、动态置顶
   - 公爵：无限超级喜欢、1v1红娘、活动优先

3. **装扮商城**
   - 头像框：不同等级解锁不同头像框
   - 聊天气泡：特殊聊天气泡样式
   - 个人主页装扮：主页背景、音乐
   - 动态装扮：发动态时的特效

4. **VIP专属活动**
   - 贵族专享匹配活动
   - 贵族专属礼物
   - 贵族排行榜

### 数据库设计
```sql
-- 贵族等级配置表
CREATE TABLE IF NOT EXISTS noble_levels (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    level TINYINT NOT NULL UNIQUE COMMENT '等级1-5',
    name VARCHAR(20) NOT NULL COMMENT '等级名称',
    icon_url VARCHAR(255) DEFAULT NULL,
    price_monthly DECIMAL(10,2) NOT NULL COMMENT '月费',
    privileges JSON NOT NULL COMMENT '特权配置',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 装扮商品表
CREATE TABLE IF NOT EXISTS dress_up_items (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    type ENUM('avatar_frame', 'chat_bubble', 'profile_bg', 'post_effect') NOT NULL,
    name VARCHAR(50) NOT NULL,
    preview_url VARCHAR(255) NOT NULL COMMENT '预览图',
    resource_url VARCHAR(255) NOT NULL COMMENT '资源文件',
    price DECIMAL(10,2) DEFAULT 0 COMMENT '价格，0表示免费',
    noble_level_required TINYINT DEFAULT 0 COMMENT '需要的贵族等级',
    is_active TINYINT(1) DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_type (type),
    INDEX idx_noble (noble_level_required)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 用户装扮表
CREATE TABLE IF NOT EXISTS user_dress_ups (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    item_id INT UNSIGNED NOT NULL,
    is_using TINYINT(1) DEFAULT 0 COMMENT '是否正在使用',
    purchased_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_user_item (user_id, item_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (item_id) REFERENCES dress_up_items(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- users表新增字段
ALTER TABLE users ADD COLUMN IF NOT EXISTS noble_level TINYINT DEFAULT 0 COMMENT '贵族等级0-5';
ALTER TABLE users ADD COLUMN IF NOT EXISTS noble_expire_time DATETIME DEFAULT NULL COMMENT '贵族过期时间';
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_frame_id INT UNSIGNED DEFAULT NULL COMMENT '当前头像框ID';
ALTER TABLE users ADD COLUMN IF NOT EXISTS chat_bubble_id INT UNSIGNED DEFAULT NULL COMMENT '当前聊天气泡ID';
ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_bg_id INT UNSIGNED DEFAULT NULL COMMENT '当前主页背景ID';
```

### API设计
```
GET  /api/vip/noble-levels                 - 获取贵族等级列表
POST /api/vip/purchase-noble               - 购买贵族
GET  /api/vip/my-noble                     - 获取我的贵族信息
GET  /api/vip/dress-up/shop                - 获取装扮商城
GET  /api/vip/dress-up/my                  - 获取我的装扮
POST /api/vip/dress-up/purchase/:itemId    - 购买装扮
POST /api/vip/dress-up/use/:itemId         - 使用装扮
GET  /api/vip/privileges                   - 获取当前特权
```

### 初始化数据
```sql
-- 初始化贵族等级
INSERT INTO noble_levels (level, name, price_monthly, privileges) VALUES
(1, '骑士', 30.00, '{"daily_like":50,"badge":true}'),
(2, '子爵', 68.00, '{"daily_like":-1,"see_likers":true,"priority_recommend":true}'),
(3, '伯爵', 128.00, '{"super_like_daily":3,"read_receipt":true,"stealth_browse":true}'),
(4, '侯爵', 328.00, '{"super_like_daily":10,"vip_service":true,"post_pin":true}'),
(5, '公爵', 648.00, '{"super_like_daily":-1,"matchmaker":true,"activity_priority":true}');
```

### 文件修改清单
- 新增 `src/controllers/vip.controller.js`
- 新增 `src/routes/vip.routes.js`
- 新增 `src/models/NobleLevel.js`
- 新增 `src/models/DressUpItem.js`
- 新增 `src/models/UserDressUp.js`
- 新增 `src/services/vip.service.js`（增强版）
- 修改 `src/models/User.js` - 添加贵族字段
- 新增 `src/db/add_vip_enhancement.sql`

---

## 📋 执行顺序建议

建议按以下顺序执行任务：

1. **任务1: 消息类型扩展** - 基础功能，影响面小
2. **任务7: 聊天体验优化** - 与任务1关联，一起做效率高
3. **任务8: 匹配体验优化** - 提升核心体验
4. **任务2: 动态广场增强** - 内容生态建设
5. **任务4: 亲密印记系统** - 用户粘性提升
6. **任务3: 智能破冰系统** - 提升聊天转化率
7. **任务9: VIP体系增强** - 商业化完善
8. **任务5: 社交游戏功能** - 增加互动性
9. **任务6: 社群/圈子功能** - 生态完善

---

## ⚠️ 注意事项

1. **数据库迁移**：每个任务都有对应的SQL文件，执行前请备份数据库
2. **路由注册**：新增的routes文件需要在server.js中注册
3. **环境变量**：部分功能可能需要配置新的环境变量
4. **第三方服务**：某些功能（如Agora通话）需要配置第三方服务密钥
5. **测试覆盖**：每个任务完成后建议编写单元测试
