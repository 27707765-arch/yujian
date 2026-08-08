-- =====================================================
-- 0012 修复充值外键：补种「金币充值」套餐（id=4）
-- 修复：vip_packages 表在 ECS 初始化时缺 id=4 的「金币充值」套餐记录
--       （0005 只补了月/季/年卡），导致 /api/orders/recharge 创建订单时
--       package_id=4 外键失败 → 充值报 5501 失败。
-- 幂等：INSERT IGNORE 按主键跳过已存在项，可重复执行。
-- =====================================================
INSERT IGNORE INTO vip_packages (id, name, price, duration, description) VALUES
(4, '金币充值', 0.00, 0, '金币充值（虚拟套餐）');
