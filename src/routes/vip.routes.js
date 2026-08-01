const express = require('express');
const authMiddleware = require('../middleware/auth');
const vc = require('../controllers/vip.controller');
const { executeQuery } = require('../utils/database');
const { success, serverError } = require('../utils/response');
const router = express.Router();
router.use(authMiddleware);

// VIP套餐列表（含金币充值套餐，前端购买页用）
router.get('/packages', async (req, res) => {
  try {
    const [rows] = await executeQuery('SELECT * FROM vip_packages WHERE price > 0 ORDER BY price ASC');
    success(res, rows);
  } catch (err) { serverError(res, err, '获取VIP套餐失败'); }
});

router.get('/noble-levels', vc.getNobleLevels);
router.get('/dress-up/shop', vc.getDressUpShop);
router.get('/dress-up/my', vc.getMyDressUps);
router.post('/dress-up/purchase/:itemId', vc.purchaseDressUp);
router.post('/dress-up/use/:itemId', vc.useDressUp);
module.exports = router;
