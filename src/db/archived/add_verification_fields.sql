-- 文件：add_verification_fields.sql
-- 用途：多重身份认证系统 - 数据库迁移脚本（幂等，可重复执行）
-- 用法：mysql -u root -p yujian < src/db/add_verification_fields.sql

USE yujian;

-- 1. 创建认证记录表
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

-- 2. users表新增认证状态字段
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_real_name_verified TINYINT(1) DEFAULT 0 COMMENT '是否实名认证：0-否，1-是';
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_face_verified TINYINT(1) DEFAULT 0 COMMENT '是否人脸认证：0-否，1-是';
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_education_verified TINYINT(1) DEFAULT 0 COMMENT '是否学历认证：0-否，1-是';
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_vehicle_verified TINYINT(1) DEFAULT 0 COMMENT '是否车辆认证：0-否，1-是';
ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_level TINYINT DEFAULT 0 COMMENT '认证等级：0-4（每有一项认证+1）';
ALTER TABLE users ADD COLUMN IF NOT EXISTS verified_badges JSON DEFAULT NULL COMMENT '认证徽章列表（JSON数组）';

-- 3. 为认证字段添加索引（加速筛选已认证用户）
ALTER TABLE users ADD INDEX IF NOT EXISTS idx_verification_level (verification_level);
