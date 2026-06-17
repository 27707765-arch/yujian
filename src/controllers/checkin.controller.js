/**
 * 签到与任务控制器
 */

const Checkin = require('../models/Checkin');
const { success, error, serverError } = require('../utils/response');

/**
 * 每日签到
 */
async function dailyCheckin(req, res) {
  try {
    const { id } = req.user;
    const result = await Checkin.checkin(id);
    if (!result.success) {
      return error(res, 400, result.message);
    }
    success(res, { streak: result.streak, reward: result.reward }, result.message);
  } catch (err) {
    serverError(res, err, '签到失败');
  }
}

/**
 * 获取签到状态
 */
async function getCheckinStatus(req, res) {
  try {
    const { id } = req.user;
    const today = new Date().toISOString().slice(0, 10);
    const hasCheckedIn = await Checkin.hasCheckedIn(id, today);
    const history = await Checkin.getHistory(id, 7);
    const streak = history.length > 0 ? history[0].streak_days : 0;

    success(res, {
      today_checked_in: hasCheckedIn,
      streak,
      history: history.slice(0, 7)
    });
  } catch (err) {
    serverError(res, err, '获取签到状态失败');
  }
}

/**
 * 获取每日任务
 */
async function getDailyTasks(req, res) {
  try {
    const { id } = req.user;
    const tasks = await Checkin.getDailyTasks(id);
    success(res, tasks);
  } catch (err) {
    serverError(res, err, '获取任务列表失败');
  }
}

module.exports = { dailyCheckin, getCheckinStatus, getDailyTasks };
