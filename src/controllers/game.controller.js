/**
 * 游戏控制器
 */
const GameService = require('../services/game.service');
const { success, error, serverError } = require('../utils/response');

async function createGame(req, res) {
  try {
    const { id } = req.user;
    const { game_type, target_user_id } = req.body;
    if (!game_type || !target_user_id) return error(res, 400, '参数不完整');
    const room = await GameService.createRoom(game_type, id, target_user_id);
    if (!room) return error(res, 500, '创建游戏房间失败');
    success(res, room, '游戏房间已创建');
  } catch (err) { serverError(res, err, '创建游戏失败'); }
}

async function recordGame(req, res) {
  try {
    const { id } = req.user;
    const { game_type, result, score, opponent_id } = req.body;
    await GameService.recordGame(id, game_type, result, score, opponent_id);
    success(res, null, '游戏记录已保存');
  } catch (err) { serverError(res, err, '保存游戏记录失败'); }
}

async function getLeaderboard(req, res) {
  try {
    const { game_type } = req.query;
    const list = await GameService.getLeaderboard(game_type || 'guess_word');
    success(res, list);
  } catch (err) { serverError(res, err, '获取排行榜失败'); }
}

async function getRandomWord(req, res) {
  try {
    const word = await GameService.getRandomWord();
    success(res, word);
  } catch (err) { serverError(res, err, '获取猜词失败'); }
}

module.exports = { createGame, recordGame, getLeaderboard, getRandomWord };
