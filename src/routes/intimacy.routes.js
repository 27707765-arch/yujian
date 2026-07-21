/**
 * 亲密关系路由
 */
const express = require('express');
const authMiddleware = require('../middleware/auth');
const intimacyController = require('../controllers/intimacy.controller');

const router = express.Router();
router.use(authMiddleware);

router.get('/badges', intimacyController.getBadges);
router.get('/:userId/anniversaries', intimacyController.getAnniversaries);
router.get('/:userId', intimacyController.getRelationship);

module.exports = router;
