# 遇见APP功能增强 - Claude Code开发提示词文档
# 版本: 1.0
# 更新日期: 2026-07-17

---

## 📋 使用说明

本文档包含多个独立的开发任务，每个任务都可以单独提交给Claude Code执行。
建议按照优先级顺序执行，每个任务完成后进行测试验证。

---

## 🎯 任务1: 多重身份认证系统

### 任务描述
为遇见APP添加多重身份认证功能，包括实名认证、真人认证、学历认证等，提升平台用户信任度。

### 技术要求
- **数据库**: MySQL 8.0+
- **框架**: Express.js
- **认证方式**: OCR识别 + 人脸比对

### 数据库设计

```sql
-- 创建认证信息表
CREATE TABLE IF NOT EXISTS user_verifications (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    verification_type ENUM('real_name', 'face', 'education', 'vehicle', 'income') NOT NULL,
    status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
    real_name VARCHAR(50) DEFAULT NULL,
    id_card_number VARCHAR(18) DEFAULT NULL,
    id_card_front_url VARCHAR(255) DEFAULT NULL,
    id_card_back_url VARCHAR(255) DEFAULT NULL,
    face_image_url VARCHAR(255) DEFAULT NULL,
    face_video_url VARCHAR(255) DEFAULT NULL,
    school_name VARCHAR(100) DEFAULT NULL,
    education_level VARCHAR(20) DEFAULT NULL,
    graduation_year INT DEFAULT NULL,
    education_cert_url VARCHAR(255) DEFAULT NULL,
    car_brand VARCHAR(50) DEFAULT NULL,
    car_model VARCHAR(50) DEFAULT NULL,
    driving_license_url VARCHAR(255) DEFAULT NULL,
    reviewed_by INT UNSIGNED DEFAULT NULL,
    reviewed_at DATETIME DEFAULT NULL,
    rejected_reason VARCHAR(255) DEFAULT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_user_type (user_id, verification_type),
    INDEX idx_status (status),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- users表新增认证字段
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_real_name_verified TINYINT(1) DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_face_verified TINYINT(1) DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_education_verified TINYINT(1) DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_vehicle_verified TINYINT(1) DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_level TINYINT DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS verified_badges JSON DEFAULT NULL;
```

### API设计

```javascript
// src/routes/verification.routes.js
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const verificationController = require('../controllers/verification.controller');

router.post('/real-name', auth, verificationController.submitRealNameVerification);
router.post('/face', auth, verificationController.submitFaceVerification);
router.post('/education', auth, verificationController.submitEducationVerification);
router.post('/vehicle', auth, verificationController.submitVehicleVerification);
router.get('/status', auth, verificationController.getVerificationStatus);
router.get('/detail/:type', auth, verificationController.getVerificationDetail);

module.exports = router;
```

### 服务层实现

```javascript
// src/services/verification.service.js

class VerificationService {
    static async recognizeIdCard(imageUrl) {
        // 实现OCR识别逻辑
        // 返回：{ name, id_number, gender, birth, address }
    }
    
    static async compareFaces(image1Url, image2Url) {
        // 调用人脸比对API
        // 返回：{ match: boolean, confidence: number }
    }
    
    static async livenessDetection(videoUrl) {
        // 调用活体检测API
        // 返回：{ is_live: boolean, confidence: number }
    }
    
    static calculateVerificationLevel(user) {
        let level = 0;
        if (user.is_real_name_verified) level++;
        if (user.is_face_verified) level++;
        if (user.is_education_verified) level++;
        if (user.is_vehicle_verified) level++;
        return level;
    }
    
    static getVerificationBadges(user) {
        const badges = [];
        if (user.is_real_name_verified) badges.push('real_name');
        if (user.is_face_verified) badges.push('face');
        if (user.is_education_verified) badges.push('education');
        if (user.is_vehicle_verified) badges.push('vehicle');
        return badges;
    }
}
```

---

## 🎯 任务2: 智能匹配算法升级

### 任务描述
升级现有的匹配推荐算法，引入多维度评分和协同过滤，提升匹配精准度。

### 数据库设计

```sql
-- 用户行为记录表
CREATE TABLE IF NOT EXISTS user_behaviors (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    target_user_id INT UNSIGNED NOT NULL,
    action ENUM('view', 'like', 'skip', 'message', 'match', 'unmatch') NOT NULL,
    duration INT DEFAULT NULL,
    source VARCHAR(50) DEFAULT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_user_action (user_id, action, created_at),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (target_user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 用户兴趣画像表
CREATE TABLE IF NOT EXISTS user_interest_profiles (
    user_id INT UNSIGNED PRIMARY KEY,
    interest_vector JSON COMMENT '兴趣向量',
    behavior_pattern JSON COMMENT '行为模式',
    preference_age_min INT DEFAULT 18,
    preference_age_max INT DEFAULT 35,
    preference_distance INT DEFAULT 50,
    preference_gender TINYINT(1) DEFAULT NULL,
    last_active_at DATETIME DEFAULT NULL,
    activity_score FLOAT DEFAULT 0,
    popularity_score FLOAT DEFAULT 0,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;
```

### 核心算法

```javascript
// src/services/matchAlgorithm.service.js

class MatchAlgorithm {
    static calculateMatchScore(currentUser, candidate) {
        const breakdown = {};
        let totalScore = 0;
        
        // 地理位置 (25%)
        const locationScore = this.calculateLocationScore(currentUser, candidate);
        breakdown.location = locationScore;
        totalScore += locationScore * 0.25;
        
        // 年龄匹配 (15%)
        const ageScore = this.calculateAgeScore(currentUser, candidate);
        breakdown.age = ageScore;
        totalScore += ageScore * 0.15;
        
        // 兴趣标签 (25%)
        const interestScore = this.calculateInterestScore(currentUser, candidate);
        breakdown.interest = interestScore;
        totalScore += interestScore * 0.25;
        
        // 活跃度 (15%)
        const activityScore = this.calculateActivityScore(candidate);
        breakdown.activity = activityScore;
        totalScore += activityScore * 0.15;
        
        // 认证等级 (10%)
        const verificationScore = this.calculateVerificationScore(candidate);
        breakdown.verification = verificationScore;
        totalScore += verificationScore * 0.10;
        
        // 受欢迎度 (10%)
        const popularityScore = this.calculatePopularityScore(candidate);
        breakdown.popularity = popularityScore;
        totalScore += popularityScore * 0.10;
        
        return { score: Math.round(totalScore * 100) / 100, breakdown };
    }
    
    static calculateLocationScore(userA, userB) {
        if (userA.city && userB.city && userA.city === userB.city) {
            let score = 80;
            if (userA.lat && userA.lng && userB.lat && userB.lng) {
                const distance = this.calculateDistance(userA.lat, userA.lng, userB.lat, userB.lng);
                const distancePenalty = Math.floor(distance / 5) * 10;
                score = Math.max(50, score - distancePenalty);
            }
            return score;
        }
        if (userA.province && userB.province && userA.province === userB.province) return 50;
        return 20;
    }
    
    static calculateInterestScore(userA, userB) {
        const tagsA = new Set(userA.tags || []);
        const tagsB = new Set(userB.tags || []);
        if (tagsA.size === 0 || tagsB.size === 0) return 50;
        const intersection = new Set([...tagsA].filter(x => tagsB.has(x)));
        const union = new Set([...tagsA, ...tagsB]);
        return Math.round((intersection.size / union.size) * 100);
    }
    
    static calculateDistance(lat1, lng1, lat2, lng2) {
        const R = 6371;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLng = (lng2 - lng1) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                  Math.sin(dLng/2) * Math.sin(dLng/2);
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    }
}
```

---

## 🎯 任务3: 语音/视频通话系统

### 任务描述
实现基于WebRTC的实时音视频通话功能。

### 技术选型
- **SDK**: 声网Agora 或 腾讯云TRTC
- **信令**: WebSocket

### 数据库设计

```sql
CREATE TABLE IF NOT EXISTS call_records (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    channel_name VARCHAR(100) NOT NULL,
    caller_id INT UNSIGNED NOT NULL,
    callee_id INT UNSIGNED NOT NULL,
    call_type ENUM('voice', 'video') NOT NULL,
    status ENUM('ringing', 'connected', 'ended', 'missed', 'rejected', 'cancelled') NOT NULL,
    started_at DATETIME DEFAULT NULL,
    connected_at DATETIME DEFAULT NULL,
    ended_at DATETIME DEFAULT NULL,
    duration INT DEFAULT 0,
    end_reason VARCHAR(50) DEFAULT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_caller (caller_id, created_at),
    INDEX idx_callee (callee_id, created_at),
    FOREIGN KEY (caller_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (callee_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;
```

### 核心服务

```javascript
// src/services/call.service.js

const { RtcTokenBuilder, RtcRole } = require('agora-access-token');

class CallService {
    constructor() {
        this.appId = process.env.AGORA_APP_ID;
        this.appCertificate = process.env.AGORA_APP_CERTIFICATE;
    }
    
    generateToken(channelName, uid, role = 'publisher') {
        const expirationTimeInSeconds = 3600;
        const currentTimestamp = Math.floor(Date.now() / 1000);
        const privilegeExpiredTs = currentTimestamp + expirationTimeInSeconds;
        
        return RtcTokenBuilder.buildTokenWithUid(
            this.appId, this.appCertificate, channelName, uid,
            role === 'publisher' ? RtcRole.PUBLISHER : RtcRole.SUBSCRIBER,
            privilegeExpiredTs
        );
    }
    
    async initiateCall(callerId, calleeId, callType = 'voice') {
        const isBlocked = await Block.isBlocked(callerId, calleeId);
        if (isBlocked) throw new Error('无法发起通话，对方已将您拉黑');
        
        const channelName = `call_${callerId}_${calleeId}_${Date.now()}`;
        const callerToken = this.generateToken(channelName, callerId);
        const calleeToken = this.generateToken(channelName, calleeId);
        
        const callRecord = await CallRecord.create({
            channel_name: channelName,
            caller_id: callerId,
            callee_id: calleeId,
            call_type: callType,
            status: 'ringing',
            started_at: new Date()
        });
        
        return {
            call_id: callRecord.id,
            channel_name: channelName,
            token: callerToken
        };
    }
    
    async acceptCall(callId, userId) {
        await CallRecord.update(callId, { status: 'connected', connected_at: new Date() });
        return { success: true };
    }
    
    async endCall(callId, userId) {
        const callRecord = await CallRecord.findById(callId);
        const duration = callRecord.connected_at 
            ? Math.floor((Date.now() - new Date(callRecord.connected_at).getTime()) / 1000)
            : 0;
        
        await CallRecord.update(callId, {
            status: 'ended', ended_at: new Date(), duration
        });
        
        return { success: true, duration };
    }
}

module.exports = new CallService();
```

---

## 📝 代码规范

### 命名规范
- 文件名：小写+连字符（如 `user.controller.js`）
- 类名：大驼峰（如 `MatchAlgorithm`）
- 函数/变量：小驼峰（如 `calculateScore`）
- 常量：全大写+下划线（如 `MAX_RETRY_COUNT`）

### 响应格式
```javascript
// 成功响应
{ code: 0, message: 'success', data: {...} }

// 错误响应
{ code: 400, message: '错误信息', data: null }
```

---

## ✅ 完成检查清单

每个任务完成后，请确认：
- [ ] 代码符合命名规范
- [ ] 所有函数都有JSDoc注释
- [ ] 数据库迁移脚本已创建
- [ ] API文档已更新
- [ ] 单元测试已编写并通过
- [ ] 错误处理完善
- [ ] 日志记录完整
- [ ] 性能优化（缓存、索引）
- [ ] 安全检查（输入验证、权限校验）
