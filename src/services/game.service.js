/**
 * 游戏服务
 */
const { executeQuery, isDbAvailable } = require('../utils/database');

class GameService {
  static async createRoom(gameType, player1Id, player2Id) {
    try {
      if (!isDbAvailable()) return null;
      const [result] = await executeQuery(
        'INSERT INTO game_rooms (game_type, player1_id, player2_id) VALUES (?,?,?)',
        [gameType, player1Id, player2Id]
      );
      return { id: result.insertId, game_type: gameType, player1_id: player1Id, player2_id: player2Id, status: 'waiting' };
    } catch(e) { return null; }
  }

  static async updateStatus(roomId, status, winnerId = null) {
    try {
      if (!isDbAvailable()) return;
      if (status === 'finished') {
        await executeQuery('UPDATE game_rooms SET status=?, winner_id=?, ended_at=NOW() WHERE id=?', [status, winnerId, roomId]);
      } else {
        await executeQuery('UPDATE game_rooms SET status=?, started_at=NOW() WHERE id=?', [status, roomId]);
      }
    } catch(e) {}
  }

  static async recordGame(userId, gameType, result, score, opponentId) {
    try {
      if (!isDbAvailable()) return;
      await executeQuery(
        'INSERT INTO game_records (user_id, game_type, result, score, opponent_id) VALUES (?,?,?,?,?)',
        [userId, gameType, result, score, opponentId]
      );
    } catch(e) {}
  }

  static async getLeaderboard(gameType, limit = 20) {
    try {
      if (!isDbAvailable()) return [];
      const [rows] = await executeQuery(
        'SELECT user_id, COUNT(*) as games, SUM(CASE WHEN result="win" THEN 1 ELSE 0 END) as wins FROM game_records WHERE game_type=? GROUP BY user_id ORDER BY wins DESC LIMIT ?',
        [gameType, limit]
      );
      return rows;
    } catch(e) { return []; }
  }

  static async getRandomWord() {
    try {
      if (!isDbAvailable()) return null;
      const [rows] = await executeQuery('SELECT * FROM guess_words WHERE is_active=1 ORDER BY RAND() LIMIT 1');
      return rows[0] || null;
    } catch(e) { return null; }
  }
}

module.exports = GameService;
