/**
 * 认证审核控制器
 */
const { executeQuery } = require('../utils/database');
const UserVerification = require('../models/UserVerification');
const User = require('../models/User');
const { success, error, serverError } = require('../utils/response');

async function getVerificationList(req, res) {
  try {
    const { type, status, keyword, limit = 20, offset = 0 } = req.query;
    let sql = 'SELECT v.*, u.nickname, u.phone FROM user_verifications v LEFT JOIN users u ON v.user_id = u.id WHERE 1=1';
    const params = [];
    if (type) { sql += ' AND v.verification_type = ?'; params.push(type); }
    if (status) { sql += ' AND v.status = ?'; params.push(status); }
    if (keyword) { sql += ' AND (u.nickname LIKE ? OR u.phone LIKE ?)'; params.push(`%${keyword}%`, `%${keyword}%`); }
    sql += ' ORDER BY v.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));
    const [rows] = await executeQuery(sql, params);
    const [[{ total }]] = await executeQuery('SELECT COUNT(*) as total FROM user_verifications');
    success(res, { list: rows, total });
  } catch (err) { serverError(res, err, '获取认证列表失败'); }
}

async function getVerificationStats(req, res) {
  try {
    const [rows] = await executeQuery(
      'SELECT verification_type, status, COUNT(*) as cnt FROM user_verifications GROUP BY verification_type, status'
    );
    success(res, rows);
  } catch (err) { serverError(res, err, '获取统计失败'); }
}

async function approveVerification(req, res) {
  try {
    const { id } = req.params;
    const record = await UserVerification.findById(parseInt(id));
    if (!record) return error(res, 404, '认证记录不存在');
    await UserVerification.updateStatus(record.id, 'approved');
    // 更新用户认证字段
    const typeFieldMap = { real_name: 'is_real_name_verified', face: 'is_face_verified', education: 'is_education_verified', vehicle: 'is_vehicle_verified' };
    const field = typeFieldMap[record.verification_type];
    if (field) {
      await executeQuery(`UPDATE users SET ${field} = 1 WHERE id = ?`, [record.user_id]);
      // 更新认证等级
      const [userRows] = await executeQuery('SELECT * FROM users WHERE id = ?', [record.user_id]);
      if (userRows[0]) {
        const user = userRows[0];
        let level = 0;
        if (user.is_real_name_verified) level++; if (user.is_face_verified) level++; if (user.is_education_verified) level++; if (user.is_vehicle_verified) level++;
        await executeQuery('UPDATE users SET verification_level = ? WHERE id = ?', [level, record.user_id]);
      }
    }
    success(res, null, '审核通过');
  } catch (err) { serverError(res, err, '审核操作失败'); }
}

async function rejectVerification(req, res) {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const record = await UserVerification.findById(parseInt(id));
    if (!record) return error(res, 404, '认证记录不存在');
    await executeQuery('UPDATE user_verifications SET status = ?, rejected_reason = ? WHERE id = ?', ['rejected', reason || '不符合要求', record.id]);
    success(res, null, '已拒绝');
  } catch (err) { serverError(res, err, '拒绝操作失败'); }
}

module.exports = { getVerificationList, getVerificationStats, approveVerification, rejectVerification };
