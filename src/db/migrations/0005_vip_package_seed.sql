-- =====================================================
-- 0005 VIP套餐 seed 数据
-- 修复：vip_packages 表在 ECS 初始化时未灌入 schema.sql 的种子数据，
--       导致购买页(VipPage/orders)恒为空。
-- INSERT IGNORE 幂等，可重复执行。
-- =====================================================

INSERT IGNORE INTO vip_packages (name, price, duration, description) VALUES
('月卡', 30.00, 30, '包月VIP特权'),
('季卡', 80.00, 90, '包季VIP特权'),
('年卡', 298.00, 365, '包年VIP特权');
