/**
 * 聊天增强模型: 快捷回复 + 聊天背景 + 消息搜索
 */
const { executeQuery, isDbAvailable } = require('../utils/database');

class ChatEnhance {
  // ===== 快捷回复 =====
  static async getQuickReplies(userId) {
    try { if (isDbAvailable()) { const [r] = await executeQuery('SELECT * FROM quick_replies WHERE user_id = ? ORDER BY sort_order ASC', [userId]); return r; } } catch(e) {}
    return [];
  }
  static async addQuickReply(userId, content) {
    try { if (isDbAvailable()) { const [r] = await executeQuery('INSERT INTO quick_replies (user_id, content) VALUES (?,?)', [userId, content]); return { id: r.insertId, content }; } } catch(e) { return null; }
  }
  static async deleteQuickReply(id, userId) {
    try { if (isDbAvailable()) { await executeQuery('DELETE FROM quick_replies WHERE id = ? AND user_id = ?', [id, userId]); } } catch(e) {}
  }

  // ===== 聊天背景 =====
  static async getBackground(userId, conversationId) {
    try { if (isDbAvailable()) { const [r] = await executeQuery('SELECT * FROM chat_backgrounds WHERE user_id = ? AND conversation_id = ?', [userId, conversationId]); return r[0] || null; } } catch(e) { return null; }
  }
  static async setBackground(userId, conversationId, backgroundUrl) {
    try { if (isDbAvailable()) { await executeQuery('INSERT INTO chat_backgrounds (user_id, conversation_id, background_url) VALUES (?,?,?) ON DUPLICATE KEY UPDATE background_url = VALUES(background_url)', [userId, conversationId, backgroundUrl]); } } catch(e) {}
  }

  // ===== 消息搜索 =====
  static async searchMessages(userId, keyword, conversationId = null) {
    try {
      if (!isDbAvailable()) return [];
      let sql = 'SELECT m.* FROM messages m JOIN conversations c ON m.conversation_id = c.id WHERE (c.user1_id = ? OR c.user2_id = ?) AND m.content LIKE ?';
      const params = [userId, userId, `%${keyword}%`];
      if (conversationId) { sql += ' AND m.conversation_id = ?'; params.push(conversationId); }
      sql += ' ORDER BY m.created_at DESC LIMIT 50';
      const [r] = await executeQuery(sql, params);
      return r;
    } catch(e) { return []; }
  }
}

module.exports = ChatEnhance;
