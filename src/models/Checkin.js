/**
 * 签到与任务模型
 * 管理用户每日签到和任务系统
 */

const { executeQuery, isDbAvailable } = require('../utils/database');
const Wallet = require('./Wallet');

// 内存存储
const checkinMemory = new Map();
const taskMemory = new Map();

// 每日任务模板
const DAILY_TASKS = [
  { key: 'complete_profile', name: '完善个人资料', reward: 20, max: 1 },
  { key: 'upload_photo', name: '上传3张照片', reward: 15, max: 1 },
  { key: 'like_users', name: '喜欢10个用户', reward: 10, max: 1 },
  { key: 'chat_start', name: '与1人发起聊天', reward: 10, max: 1 },
  { key: 'post_moment', name: '发布1条动态', reward: 5, max: 1 },
  { key: 'send_gift', name: '赠送1个礼物', reward: 30, max: 1 },
];

class Checkin {
  /**
   * 每日签到
   * @param {number} userId - 用户ID
   * @returns {Promise<Object>}
   */
  static async checkin(userId) {
    const today = new Date().toISOString().slice(0, 10);

    // 计算连续签到天数（需在插入前计算，基于昨日记录）
    const streak = await this.calcStreak(userId, today);

    // 计算奖励（基础5金币 + 连续签到加成）
    const baseReward = 5;
    const streakBonus = Math.min(streak, 7) * 2; // 最多7天加成
    const totalReward = baseReward + streakBonus;

    let actuallyInserted = false;

    try {
      if (isDbAvailable()) {
        // 使用 INSERT IGNORE 原子化插入，消除"先查后插"的竞态条件
        // 若今日已有记录，唯一约束 (user_id, checkin_date) 使本次插入静默忽略
        const [result] = await executeQuery(
          'INSERT IGNORE INTO daily_checkins (user_id, checkin_date, streak_days, reward_coins) VALUES (?, ?, ?, ?)',
          [userId, today, streak + 1, totalReward]
        );
        actuallyInserted = result.affectedRows > 0;
      } else {
        // 内存降级：JS 单线程中检查+插入天然原子
        if (!checkinMemory.has(userId)) checkinMemory.set(userId, []);
        const records = checkinMemory.get(userId);
        const alreadyDone = records.some(r => r.date === today);
        if (!alreadyDone) {
          records.push({ date: today, streak: streak + 1, reward: totalReward });
          actuallyInserted = true;
        }
      }
    } catch (err) {
      console.error('签到持久化失败:', err.message);
    }

    // 仅当真正插入了签到记录时才发放金币（affectedRows > 0）
    if (actuallyInserted) {
      await Wallet.recharge(userId, totalReward, 'checkin', null);
      return {
        success: true,
        streak: streak + 1,
        reward: totalReward,
        message: `签到成功！连续签到第${streak + 1}天`
      };
    }

    return { success: false, message: '今日已签到' };
  }

  /**
   * 检查是否已签到
   */
  static async hasCheckedIn(userId, date) {
    try {
      if (isDbAvailable()) {
        const [rows] = await executeQuery(
          'SELECT id FROM daily_checkins WHERE user_id = ? AND checkin_date = ?',
          [userId, date]
        );
        return rows.length > 0;
      }
    } catch (err) {
      // fall through
    }
    const records = checkinMemory.get(userId) || [];
    return records.some(r => r.date === date);
  }

  /**
   * 计算连续签到天数
   */
  static async calcStreak(userId, today) {
    try {
      if (isDbAvailable()) {
        const [rows] = await executeQuery(
          'SELECT streak_days, checkin_date FROM daily_checkins WHERE user_id = ? ORDER BY checkin_date DESC LIMIT 1',
          [userId]
        );
        if (rows.length === 0) return 0;
        const lastDate = new Date(rows[0].checkin_date);
        const expectedPrev = new Date(today);
        expectedPrev.setDate(expectedPrev.getDate() - 1);
        if (lastDate.toISOString().slice(0, 10) === expectedPrev.toISOString().slice(0, 10)) {
          return rows[0].streak_days;
        }
        return 0;
      }
    } catch (err) {
      // fall through
    }
    const records = (checkinMemory.get(userId) || []).sort((a, b) => b.date.localeCompare(a.date));
    if (records.length === 0) return 0;
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    if (records[0].date === yesterday.toISOString().slice(0, 10)) {
      return records[0].streak;
    }
    return 0;
  }

  /**
   * 获取签到历史
   */
  static async getHistory(userId, limit = 30) {
    try {
      if (isDbAvailable()) {
        const [rows] = await executeQuery(
          'SELECT * FROM daily_checkins WHERE user_id = ? ORDER BY checkin_date DESC LIMIT ?',
          [userId, limit]
        );
        return rows;
      }
    } catch (err) {
      console.error('查询签到记录失败:', err.message);
    }
    return (checkinMemory.get(userId) || []).slice(-limit).reverse();
  }

  // ==================== 每日任务 ====================

  /**
   * 获取每日任务列表及用户进度
   */
  static async getDailyTasks(userId) {
    const today = new Date().toISOString().slice(0, 10);
    const progressMap = await this.getTaskProgressMap(userId, today);

    return DAILY_TASKS.map(task => {
      const progress = progressMap[task.key] || 0;
      return { ...task, progress, completed: progress >= task.max };
    });
  }

  /**
   * 获取用户当天所有任务进度（查数据库，内存 fallback）
   */
  static async getTaskProgressMap(userId, date) {
    try {
      if (isDbAvailable()) {
        // 查找当天已完成的任务记录
        const [rows] = await executeQuery(
          'SELECT task_key, MAX(progress) as progress FROM user_tasks WHERE user_id = ? AND task_date = ? GROUP BY task_key',
          [userId, date]
        );
        const map = {};
        rows.forEach(r => { map[r.task_key] = r.progress; });
        return map;
      }
    } catch (err) {
      console.error('查询任务进度失败:', err.message);
    }
    // 内存 fallback
    const map = {};
    for (const [key, value] of taskMemory.entries()) {
      if (key.startsWith(`${userId}:${date}:`)) {
        map[key.split(':')[2]] = value;
      }
    }
    return map;
  }

  /**
   * 更新任务进度（使用 UPSERT 避免竞态条件）
   */
  static async updateTaskProgress(userId, taskKey, increment = 1) {
    const today = new Date().toISOString().slice(0, 10);

    // 持久化到数据库（INSERT ... ON DUPLICATE KEY UPDATE 原子操作，消除并发竞态）
    try {
      if (isDbAvailable()) {
        await executeQuery(
          'INSERT INTO user_tasks (user_id, task_key, task_date, progress) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE progress = progress + ?',
          [userId, taskKey, today, increment, increment]
        );
      }
    } catch (err) {
      console.error('任务进度持久化失败:', err.message);
    }

    // 内存 fallback
    const key = `${userId}:${today}:${taskKey}`;
    const current = taskMemory.get(key) || 0;
    const newProgress = current + increment;
    taskMemory.set(key, newProgress);

    // 获取当前实际进度（数据库 + 内存取最大值）
    const progressMap = await this.getTaskProgressMap(userId, today);
    const actualProgress = Math.max(progressMap[taskKey] || 0, newProgress);

    // 检查任务是否完成，发放奖励（仅首次达到阈值时发放，避免重复发放）
    const task = DAILY_TASKS.find(t => t.key === taskKey);
    const previousProgress = actualProgress - increment;
    if (task && actualProgress >= task.max && previousProgress < task.max) {
      try {
        await Wallet.recharge(userId, task.reward, 'task_reward', null);
        return { completed: true, reward: task.reward, message: `完成任务「${task.name}」，获得${task.reward}金币` };
      } catch (err) {
        console.error('发放任务奖励失败:', err.message);
      }
    }
    return { completed: false, progress: actualProgress, max: task ? task.max : 1 };
  }
}

module.exports = Checkin;
