# 遇见APP后台管理系统增强 - Claude Code提示词清单
# 项目路径：E:\项目文件\APP\yujian

---

## 任务1: 认证审核管理系统

为遇见APP后台添加认证审核功能，审核用户提交的实名、人脸、学历、车辆认证。

### 数据库设计
```sql
-- 已有user_verifications表，无需新建
-- 新增审核相关索引
ALTER TABLE user_verifications ADD INDEX IF NOT EXISTS idx_status_type (status, verification_type);
```

### API路由（添加到admin.routes.js）
```javascript
router.get('/verifications', adminVerificationController.getVerificationList);
router.get('/verifications/stats', adminVerificationController.getVerificationStats);
router.get('/verifications/:id', adminVerificationController.getVerificationDetail);
router.put('/verifications/:id/approve', adminVerificationController.approveVerification);
router.put('/verifications/:id/reject', adminVerificationController.rejectVerification);
router.post('/verifications/batch-approve', adminVerificationController.batchApprove);
```

### 控制器实现
创建文件 `src/controllers/admin.verification.controller.js`，实现以下功能：

1. **getVerificationList** - 获取认证申请列表
   - 支持按认证类型筛选（real_name/face/education/vehicle）
   - 支持按状态筛选（pending/approved/rejected）
   - 支持关键词搜索（用户名、手机号）
   - 返回各状态数量统计

2. **getVerificationDetail** - 获取认证详情
   - 返回用户基本信息和提交的认证资料
   - 返回证件照片URL
   - 返回该用户的所有认证记录

3. **approveVerification** - 审核通过
   - 更新认证状态为approved
   - 更新用户对应认证字段（is_real_name_verified等）
   - 更新用户认证等级（verification_level）
   - 更新用户认证徽章（verified_badges）

4. **rejectVerification** - 审核拒绝
   - 更新认证状态为rejected
   - 记录拒绝原因

5. **batchApprove** - 批量审核
   - 接收ID数组，批量通过

6. **getVerificationStats** - 认证统计
   - 按类型统计各状态数量
   - 今日新增数量

---

## 任务2: 用户详情管理增强

增强用户管理功能，添加用户详情查看、行为分析、强制操作等。

### 数据库设计
```sql
-- 管理员备注表
CREATE TABLE IF NOT EXISTS user_admin_notes (
    user_id INT UNSIGNED PRIMARY KEY,
    note TEXT,
    updated_by INT UNSIGNED,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### API路由
```javascript
router.get('/users/:id', adminUserController.getUserDetail);
router.get('/users/:id/stats', adminUserController.getUserStats);
router.get('/users/:id/wallet', adminUserController.getUserWallet);
router.put('/users/:id/profile', adminUserController.updateUserProfile);
router.post('/users/:id/reset-password', adminUserController.resetUserPassword);
router.post('/users/:id/send-message', adminUserController.sendSystemMessage);
router.put('/users/:id/note', adminUserController.updateUserNote);
```

### 控制器实现
创建文件 `src/controllers/admin.user.controller.js`，实现以下功能：

1. **getUserDetail** - 用户详情
   - 完整个人资料
   - 照片列表
   - 认证状态
   - VIP状态
   - 钱包余额
   - 统计数据（喜欢数、匹配数、消息数、动态数）

2. **getUserStats** - 用户行为统计
   - 最近7天操作统计
   - 匹配成功率

3. **getUserWallet** - 钱包详情
   - 余额、充值、消费、收入
   - 最近交易记录

4. **updateUserProfile** - 强制修改资料
   - 支持修改昵称、简介、性别、年龄、状态

5. **resetUserPassword** - 重置密码
   - 使用bcrypt加密新密码

6. **sendSystemMessage** - 发送系统消息
   - 通过WebSocket发送

7. **updateUserNote** - 管理员备注
   - 添加/更新管理员对用户的备注

---

## 任务3: 内容审核系统

添加敏感词管理、审核队列、审核历史等功能。

### 数据库设计
```sql
-- 敏感词表
CREATE TABLE IF NOT EXISTS sensitive_words (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    word VARCHAR(50) NOT NULL UNIQUE,
    category VARCHAR(30) DEFAULT '其他',
    level TINYINT DEFAULT 1,
    is_active TINYINT(1) DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 审核记录表
CREATE TABLE IF NOT EXISTS audit_logs (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    content_type ENUM('post', 'comment', 'message', 'user_profile') NOT NULL,
    content_id INT UNSIGNED NOT NULL,
    user_id INT UNSIGNED NOT NULL,
    content_text TEXT,
    audit_result ENUM('pass', 'reject', 'pending') DEFAULT 'pending',
    reject_reason VARCHAR(200),
    auditor_id INT UNSIGNED,
    audited_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_type_result (content_type, audit_result),
    INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- posts表新增字段
ALTER TABLE posts ADD COLUMN IF NOT EXISTS audit_status ENUM('pending', 'approved', 'rejected') DEFAULT 'approved';
ALTER TABLE posts ADD COLUMN IF NOT EXISTS audit_reason VARCHAR(200);

-- post_comments表新增字段（如果存在）
ALTER TABLE post_comments ADD COLUMN IF NOT EXISTS audit_status ENUM('pending', 'approved', 'rejected') DEFAULT 'approved';
```

### API路由
```javascript
// 敏感词管理
router.get('/sensitive-words', adminContentController.getSensitiveWords);
router.post('/sensitive-words', adminContentController.createSensitiveWord);
router.put('/sensitive-words/:id', adminContentController.updateSensitiveWord);
router.delete('/sensitive-words/:id', adminContentController.deleteSensitiveWord);
router.post('/sensitive-words/batch-import', adminContentController.batchImportSensitiveWords);

// 审核队列
router.get('/audit/queue', adminContentController.getAuditQueue);
router.put('/audit/:id/approve', adminContentController.approveContent);
router.put('/audit/:id/reject', adminContentController.rejectContent);
router.get('/audit/stats', adminContentController.getAuditStats);
router.get('/audit/logs', adminContentController.getAuditLogs);
```

### 控制器实现
创建文件 `src/controllers/admin.content.controller.js`，实现敏感词CRUD、审核队列管理、审核操作等功能。

---

## 任务4: 系统配置管理

添加运营参数配置、功能开关、公告管理等功能。

### 数据库设计
```sql
-- 系统配置表
CREATE TABLE IF NOT EXISTS system_configs (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    config_key VARCHAR(50) NOT NULL UNIQUE,
    config_value TEXT NOT NULL,
    config_type ENUM('string', 'number', 'boolean', 'json') DEFAULT 'string',
    description VARCHAR(200),
    category VARCHAR(30) DEFAULT 'general',
    updated_by INT UNSIGNED,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 公告表
CREATE TABLE IF NOT EXISTS announcements (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(100) NOT NULL,
    content TEXT NOT NULL,
    type ENUM('normal', 'popup', 'marquee') DEFAULT 'normal',
    target_users ENUM('all', 'new', 'vip', 'custom') DEFAULT 'all',
    priority INT DEFAULT 0,
    start_time DATETIME,
    end_time DATETIME,
    status ENUM('draft', 'published', 'offline') DEFAULT 'draft',
    created_by INT UNSIGNED,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 初始化配置数据
INSERT INTO system_configs (config_key, config_value, config_type, description, category) VALUES
('daily_free_likes', '20', 'number', '每日免费喜欢次数', 'limit'),
('super_like_price', '10', 'number', '超级喜欢价格(金币)', 'limit'),
('register_reward', '15', 'number', '注册奖励金币', 'reward'),
('checkin_reward', '5', 'number', '签到奖励金币', 'reward'),
('enable_register', 'true', 'boolean', '是否开放注册', 'switch'),
('enable_voice_call', 'true', 'boolean', '是否开启语音通话', 'switch'),
('enable_video_call', 'true', 'boolean', '是否开启视频通话', 'switch'),
('enable_gift', 'true', 'boolean', '是否开启礼物功能', 'switch');
```

### API路由
```javascript
// 系统配置
router.get('/configs', adminConfigController.getConfigs);
router.put('/configs/:key', adminConfigController.updateConfig);
router.put('/configs/batch', adminConfigController.batchUpdateConfigs);

// 公告管理
router.get('/announcements', adminConfigController.getAnnouncements);
router.post('/announcements', adminConfigController.createAnnouncement);
router.put('/announcements/:id', adminConfigController.updateAnnouncement);
router.delete('/announcements/:id', adminConfigController.deleteAnnouncement);
router.put('/announcements/:id/publish', adminConfigController.publishAnnouncement);
router.put('/announcements/:id/offline', adminConfigController.offlineAnnouncement);
```

### 控制器实现
创建文件 `src/controllers/admin.config.controller.js`

---

## 任务5: 管理员权限管理

添加多级管理员权限管理功能。

### 数据库设计
```sql
-- 管理员表
CREATE TABLE IF NOT EXISTS admin_users (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL UNIQUE,
    admin_role VARCHAR(20) NOT NULL DEFAULT 'operator',
    permissions JSON,
    is_active TINYINT(1) DEFAULT 1,
    last_login_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 操作日志表
CREATE TABLE IF NOT EXISTS admin_operation_logs (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    admin_id INT UNSIGNED NOT NULL,
    admin_name VARCHAR(50),
    action VARCHAR(50) NOT NULL,
    target_type VARCHAR(30),
    target_id INT UNSIGNED,
    detail JSON,
    ip VARCHAR(50),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_admin (admin_id),
    INDEX idx_action (action),
    INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 迁移现有admin用户
INSERT INTO admin_users (user_id, admin_role) SELECT id, 'super_admin' FROM users WHERE role = 'admin';
```

### 角色权限定义
```javascript
const ROLE_PERMISSIONS = {
  super_admin: ['*'],
  admin: ['user_view', 'user_edit', 'user_ban', 'content_audit', 'report_handle', 'data_view', 'push_send'],
  operator: ['data_view', 'content_audit', 'push_send'],
  auditor: ['content_audit', 'verification_audit', 'report_handle'],
  cs: ['user_view', 'report_handle']
};
```

### API路由
```javascript
router.get('/admins', adminSystemController.getAdminList);
router.post('/admins', adminSystemController.createAdmin);
router.put('/admins/:id', adminSystemController.updateAdmin);
router.put('/admins/:id/status', adminSystemController.toggleAdminStatus);
router.delete('/admins/:id', adminSystemController.deleteAdmin);
router.get('/operation-logs', adminSystemController.getOperationLogs);
```

### 控制器实现
创建文件 `src/controllers/admin.system.controller.js`

---

## 任务6: 推送消息管理

添加推送消息发送、历史记录、模板管理功能。

### 数据库设计
```sql
-- 推送记录表
CREATE TABLE IF NOT EXISTS push_records (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(100) NOT NULL,
    content TEXT NOT NULL,
    target_type ENUM('all', 'condition', 'custom') DEFAULT 'all',
    target_condition JSON,
    target_count INT DEFAULT 0,
    sent_count INT DEFAULT 0,
    status ENUM('draft', 'sending', 'completed', 'failed') DEFAULT 'draft',
    scheduled_at DATETIME,
    sent_at DATETIME,
    created_by INT UNSIGNED,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 推送模板表
CREATE TABLE IF NOT EXISTS push_templates (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(50) NOT NULL,
    title VARCHAR(100) NOT NULL,
    content TEXT NOT NULL,
    variables JSON,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### API路由
```javascript
router.post('/push/send', adminPushController.sendPush);
router.get('/push/history', adminPushController.getPushHistory);
router.get('/push/stats/:id', adminPushController.getPushStats);
router.get('/push/templates', adminPushController.getTemplates);
router.post('/push/templates', adminPushController.createTemplate);
router.put('/push/templates/:id', adminPushController.updateTemplate);
router.delete('/push/templates/:id', adminPushController.deleteTemplate);
```

### 控制器实现
创建文件 `src/controllers/admin.push.controller.js`

---

## 任务7: 数据统计报表

添加详细的数据统计和分析功能。

### API路由
```javascript
router.get('/stats/users/trend', adminStatsController.getUserTrend);
router.get('/stats/users/active', adminStatsController.getActiveUserTrend);
router.get('/stats/users/retention', adminStatsController.getUserRetention);
router.get('/stats/users/distribution', adminStatsController.getUserDistribution);
router.get('/stats/matches/success-rate', adminStatsController.getMatchSuccessRate);
router.get('/stats/revenue/trend', adminStatsController.getRevenueTrend);
router.get('/stats/revenue/conversion', adminStatsController.getRevenueConversion);
router.get('/stats/revenue/arpu', adminStatsController.getARPU);
```

### 控制器实现
创建文件 `src/controllers/admin.stats.controller.js`，实现以下统计功能：

1. **getUserTrend** - 用户注册趋势（按日/周/月）
2. **getActiveUserTrend** - 活跃用户趋势
3. **getUserRetention** - 用户留存率（次日/7日/30日）
4. **getUserDistribution** - 用户分布（性别、年龄、地域、认证）
5. **getMatchSuccessRate** - 匹配成功率趋势
6. **getRevenueTrend** - 营收趋势
7. **getRevenueConversion** - 付费转化率
8. **getARPU** - ARPU/ARPPU分析

---

## 📋 执行顺序

1. 任务5: 管理员权限管理（先建立权限体系）
2. 任务1: 认证审核管理
3. 任务2: 用户详情增强
4. 任务3: 内容审核系统
5. 任务4: 系统配置管理
6. 任务6: 推送消息管理
7. 任务7: 数据统计报表

每个任务执行前需要先执行对应的数据库迁移脚本。
