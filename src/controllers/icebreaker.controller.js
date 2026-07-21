/**
 * 破冰话题控制器
 */
const IcebreakerService = require('../services/icebreaker.service');
const User = require('../models/User');
const { success, error, serverError } = require('../utils/response');

async function getTopics(req, res) {
  try {
    const { id } = req.user;
    const matchId = parseInt(req.params.matchId);
    const user = await User.findById(id);
    // 对方ID从match_icebreakers表中获取
    const { executeQuery } = require('../utils/database');
    const [rows] = await executeQuery(
      'SELECT user1_id, user2_id, topics FROM match_icebreakers WHERE match_id = ?', [matchId]
    );
    if (rows[0]) {
      let partnerId = rows[0].user1_id === id ? rows[0].user2_id : rows[0].user1_id;
      const partner = await User.findById(partnerId);
      const topics = rows[0].topics ? (typeof rows[0].topics === 'string' ? JSON.parse(rows[0].topics) : rows[0].topics) : [];
      success(res, topics);
    } else {
      success(res, []);
    }
  } catch (err) { serverError(res, err, '获取破冰话题失败'); }
}

async function getRandomQuestion(req, res) {
  try {
    const q = await IcebreakerService.getRandomQuestion();
    success(res, q);
  } catch (err) { serverError(res, err, '获取问题失败'); }
}

module.exports = { getTopics, getRandomQuestion };
