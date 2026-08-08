-- =====================================================
-- 0011 提现申请表（我的钱包 · 模拟提现）
-- 说明：
--   1. 用户申请提现时插入一条记录，同时扣减钱包余额并写入金币流水
--   2. 公测阶段为模拟提现：状态直接置为「已提现」（status=1），待对接真实提现平台时扩展
--   3. 幂等：CREATE TABLE IF NOT EXISTS
-- =====================================================
CREATE TABLE IF NOT EXISTS withdraw_orders (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL COMMENT '用户ID',
    order_no VARCHAR(50) NOT NULL UNIQUE COMMENT '提现单号',
    amount INT NOT NULL COMMENT '提现金额（金币）',
    status TINYINT(1) DEFAULT 1 COMMENT '状态：0-处理中，1-已提现，2-已驳回',
    account VARCHAR(100) DEFAULT NULL COMMENT '提现账户（预留：支付宝/微信/银行卡）',
    remark VARCHAR(200) DEFAULT NULL COMMENT '备注',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '申请时间',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='提现申请表';
