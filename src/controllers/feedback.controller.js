/**
 * 反馈控制器
 * POST /api/feedback — 用户反馈提交
 */
const { success, error, serverError } = require('../utils/response');
const { executeQuery, isDbAvailable } = require('../utils/database');

const memoryStore = [];
let idCounter = 1;

async function submitFeedback(req, res) {
  try {
    const { id: userId } = req.user;
    const { content, contact } = req.body;
    if (!content || content.trim().length < 10) {
      return error(res, 400, '反馈内容至少10个字符');
    }
    try {
      if (isDbAvailable()) {
        await executeQuery(
          'INSERT INTO feedbacks (user_id, content, contact, status) VALUES (?, ?, ?, ?)',
          [userId, content.trim(), contact || '', 0]
        );
      } else {
        memoryStore.push({ id: idCounter++, user_id: userId, content: content.trim(), contact: contact || '', status: 0, created_at: new Date() });
      }
    } catch (e) {
      console.error('反馈保存失败:', e.message);
      memoryStore.push({ id: idCounter++, user_id: userId, content: content.trim(), contact: contact || '', status: 0, created_at: new Date() });
    }
    success(res, null, '感谢反馈！');
  } catch (err) {
    serverError(res, err, '提交反馈失败');
  }
}

module.exports = { submitFeedback };
