/**
 * 用户详情管理控制器
 */
const { executeQuery } = require('../utils/database');
const { success, error, serverError } = require('../utils/response');
const bcrypt = require('bcryptjs');

async function getUserDetail(req, res) {
  try {
    const uid = parseInt(req.params.id);
    const [users] = await executeQuery('SELECT * FROM users WHERE id = ?', [uid]);
    if (!users[0]) return error(res, 404, '用户不存在');
    const user = users[0];
    // 照片
    const [photos] = await executeQuery('SELECT * FROM user_photos WHERE user_id = ? AND status = 1', [uid]);
    // 统计
    const [[{ likeCount }]] = await executeQuery('SELECT COUNT(*) as likeCount FROM likes WHERE user_id = ?', [uid]);
    const [[{ matchCount }]] = await executeQuery('SELECT COUNT(*) as matchCount FROM matches WHERE user1_id = ? OR user2_id = ?', [uid, uid]);
    const [[{ msgCount }]] = await executeQuery('SELECT COUNT(*) as msgCount FROM messages WHERE sender_id = ?', [uid]);
    // 备注
    const [notes] = await executeQuery('SELECT * FROM user_admin_notes WHERE user_id = ?', [uid]);
    success(res, { user, photos, stats: { likeCount, matchCount, msgCount }, adminNote: notes[0] || null });
  } catch (err) { serverError(res, err, '获取用户详情失败'); }
}

async function getUserWallet(req, res) {
  try {
    const uid = parseInt(req.params.id);
    const [wallets] = await executeQuery('SELECT * FROM wallets WHERE user_id = ?', [uid]);
    const [txs] = await executeQuery('SELECT * FROM coin_transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 50', [uid]);
    success(res, { wallet: wallets[0] || null, transactions: txs });
  } catch (err) { serverError(res, err, '获取钱包失败'); }
}

async function updateUserProfile(req, res) {
  try {
    const uid = parseInt(req.params.id);
    const { nickname, bio, gender, age, status } = req.body;
    const updates = [];
    const vals = [];
    if (nickname !== undefined) { updates.push('nickname = ?'); vals.push(nickname); }
    if (bio !== undefined) { updates.push('bio = ?'); vals.push(bio); }
    if (gender !== undefined) { updates.push('gender = ?'); vals.push(gender); }
    if (age !== undefined) { updates.push('age = ?'); vals.push(age); }
    if (status !== undefined) { updates.push('status = ?'); vals.push(status); }
    if (updates.length === 0) return error(res, 400, '没有需要更新的字段');
    vals.push(uid);
    await executeQuery(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, vals);
    success(res, null, '更新成功');
  } catch (err) { serverError(res, err, '更新用户资料失败'); }
}

async function resetUserPassword(req, res) {
  try {
    const uid = parseInt(req.params.id);
    const newPass = Math.random().toString(36).slice(-8);
    const hash = await bcrypt.hash(newPass, 10);
    await executeQuery('UPDATE users SET password_hash = ? WHERE id = ?', [hash, uid]);
    success(res, { newPassword: newPass }, '密码已重置');
  } catch (err) { serverError(res, err, '重置密码失败'); }
}

async function updateUserNote(req, res) {
  try {
    const uid = parseInt(req.params.id);
    const { note } = req.body;
    await executeQuery('INSERT INTO user_admin_notes (user_id, note, updated_by) VALUES (?,?,?) ON DUPLICATE KEY UPDATE note = VALUES(note), updated_by = VALUES(updated_by)', [uid, note, req.user.id]);
    success(res, null, '备注已更新');
  } catch (err) { serverError(res, err, '更新备注失败'); }
}

module.exports = { getUserDetail, getUserWallet, updateUserProfile, resetUserPassword, updateUserNote };
