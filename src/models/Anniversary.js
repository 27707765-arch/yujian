/**
 * 纪念日模型
 */
const { executeQuery, isDbAvailable } = require('../utils/database');

class Anniversary {
  static async record(user1Id, user2Id, eventType, eventDate) {
    if (user1Id > user2Id) { [user1Id, user2Id] = [user2Id, user1Id]; }
    const dateStr = eventDate instanceof Date ? eventDate.toISOString().slice(0, 10) : String(eventDate).slice(0, 10);
    try {
      if (isDbAvailable()) {
        await executeQuery(
          'INSERT IGNORE INTO anniversaries (user1_id, user2_id, event_type, event_date) VALUES (?,?,?,?)',
          [user1Id, user2Id, eventType, dateStr]
        );
      }
    } catch (e) { /* 静默 */ }
  }

  static async getByUsers(user1Id, user2Id) {
    if (user1Id > user2Id) { [user1Id, user2Id] = [user2Id, user1Id]; }
    try {
      if (isDbAvailable()) {
        const [rows] = await executeQuery(
          'SELECT * FROM anniversaries WHERE user1_id = ? AND user2_id = ? ORDER BY event_date ASC',
          [user1Id, user2Id]
        );
        return rows;
      }
    } catch (e) { /* fallback */ }
    return [];
  }
}

module.exports = Anniversary;
