const express = require('express');
const authMiddleware = require('../middleware/auth');
const ic = require('../controllers/icebreaker.controller');
const router = express.Router();
router.use(authMiddleware);
router.get('/topics/:matchId', ic.getTopics);
router.get('/question/random', ic.getRandomQuestion);
module.exports = router;
