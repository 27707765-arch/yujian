/**
 * 亲密关系控制器
 */
const Intimacy = require('../models/Intimacy');
const Anniversary = require('../models/Anniversary');
const IntimacyBadge = require('../models/IntimacyBadge');
const intimacyService = require('../services/intimacy.service');
const { success, serverError } = require('../utils/response');

async function getRelationship(req, res) {
  try {
    const { id } = req.user;
    const targetId = parseInt(req.params.userId);
    if (!targetId) return res.status(400).json({ code: 400, message: '目标用户ID无效' });
    const record = await Intimacy.getByUsers(id, targetId);
    if (!record) return success(res, { score: 0, level: 0, level_name: '初识' });
    const score = record.score || 0;
    const level = intimacyService.getLevel(score);
    const nextLevelScore = [100, 300, 600, 1000, Infinity][level];
    const progress = level >= 4 ? 100 : Math.min(100, Math.round((score - [0,100,300,600,1000][level]) / (nextLevelScore - [0,100,300,600,1000][level]) * 100));
    success(res, {
      score, level, level_name: intimacyService.getLevelName(level),
      progress_percent: progress, next_level_score: nextLevelScore,
      consecutive_days: record.consecutive_days || 0,
      total_chat_count: record.total_chat_count || 0,
      total_call_duration: record.total_call_duration || 0,
      total_gift_value: record.total_gift_value || 0
    });
  } catch (err) { serverError(res, err, '获取亲密关系失败'); }
}

async function getAnniversaries(req, res) {
  try {
    const { id } = req.user;
    const targetId = parseInt(req.params.userId);
    const list = await Anniversary.getByUsers(id, targetId);
    success(res, list);
  } catch (err) { serverError(res, err, '获取纪念日失败'); }
}

async function getBadges(req, res) {
  try {
    const { id } = req.user;
    const badges = await IntimacyBadge.getUserBadges(id);
    success(res, badges);
  } catch (err) { serverError(res, err, '获取徽章失败'); }
}

module.exports = { getRelationship, getAnniversaries, getBadges };
