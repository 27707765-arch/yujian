/**
 * 用户认证模型
 * 处理用户身份认证记录（实名/人脸/学历/车辆）的数据库操作和内存存储
 * 遵循"DB优先 + 内存降级"模式，当数据库不可用时自动使用内存存储
 */

const { executeQuery, isDbAvailable } = require('../utils/database');

// 内存存储（当数据库不可用时使用）
const memoryStore = new Map();
let autoIncrementId = 1;

class UserVerification {
  /**
   * 创建认证申请记录
   * @param {number} userId - 用户ID
   * @param {string} type - 认证类型：real_name/face/education/vehicle
   * @param {Object} data - 认证数据
   * @returns {Promise<Object>} - 创建的认证记录
   */
  static async create(userId, type, submitData = {}) {
    try {
      if (isDbAvailable()) {
      const data = {
        user_id: userId,
        verification_type: type,
        status: 'pending',
        real_name: submitData.real_name || null,
        id_card_number: submitData.id_card_number || null,
        id_card_front_url: submitData.id_card_front_url || null,
        id_card_back_url: submitData.id_card_back_url || null,
        face_image_url: submitData.face_image_url || null,
        face_video_url: submitData.face_video_url || null,
        school_name: submitData.school_name || null,
        education_level: submitData.education_level || null,
        graduation_year: submitData.graduation_year || null,
        education_cert_url: submitData.education_cert_url || null,
        car_brand: submitData.car_brand || null,
        car_model: submitData.car_model || null,
        driving_license_url: submitData.driving_license_url || null
      };

      // 根据类型构建字段和值列表
      const typeFieldMap = {
        real_name: ['user_id', 'verification_type', 'status', 'real_name', 'id_card_number', 'id_card_front_url', 'id_card_back_url'],
        face: ['user_id', 'verification_type', 'status', 'face_image_url', 'face_video_url', 'id_card_front_url'],
        education: ['user_id', 'verification_type', 'status', 'school_name', 'education_level', 'graduation_year', 'education_cert_url'],
        vehicle: ['user_id', 'verification_type', 'status', 'car_brand', 'car_model', 'driving_license_url'],
      };

      const fieldNames = typeFieldMap[type] || ['user_id', 'verification_type', 'status'];
      const fieldValues = fieldNames.map(col => data[col]);
      const placeholders = fieldNames.map(() => '?').join(', ');

      const [result] = await executeQuery(
        `INSERT INTO user_verifications (${fieldNames.join(', ')}) VALUES (${placeholders})`,
        fieldValues
      );
        return this.findById(result.insertId);
      }
    } catch (err) {
      console.error('数据库插入认证记录失败，使用内存存储:', err.message);
    }

    // 内存降级
    const id = autoIncrementId++;
    const record = {
      id,
      user_id: userId,
      verification_type: type,
      status: 'pending',
      real_name: data.real_name || null,
      id_card_number: data.id_card_number || null,
      id_card_front_url: data.id_card_front_url || null,
      id_card_back_url: data.id_card_back_url || null,
      face_image_url: data.face_image_url || null,
      face_video_url: data.face_video_url || null,
      school_name: data.school_name || null,
      education_level: data.education_level || null,
      graduation_year: data.graduation_year || null,
      education_cert_url: data.education_cert_url || null,
      car_brand: data.car_brand || null,
      car_model: data.car_model || null,
      driving_license_url: data.driving_license_url || null,
      reviewed_by: null,
      reviewed_at: null,
      rejected_reason: null,
      created_at: new Date(),
      updated_at: new Date()
    };
    memoryStore.set(id, record);
    return record;
  }

  /**
   * 根据ID查找认证记录
   * @param {number} id - 记录ID
   * @returns {Promise<Object|null>}
   */
  static async findById(id) {
    try {
      if (isDbAvailable()) {
        const [rows] = await executeQuery('SELECT * FROM user_verifications WHERE id = ?', [id]);
        return rows[0] || null;
      }
    } catch (err) {
      console.error('数据库查询认证记录失败，使用内存存储:', err.message);
    }
    return memoryStore.get(id) || null;
  }

  /**
   * 获取用户所有认证记录
   * @param {number} userId - 用户ID
   * @returns {Promise<Array>} - 认证记录列表
   */
  static async findByUserId(userId) {
    try {
      if (isDbAvailable()) {
        const [rows] = await executeQuery(
          'SELECT * FROM user_verifications WHERE user_id = ? ORDER BY created_at DESC',
          [userId]
        );
        return rows;
      }
    } catch (err) {
      console.error('数据库查询认证记录失败，使用内存存储:', err.message);
    }
    return Array.from(memoryStore.values())
      .filter(r => r.user_id === userId)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }

  /**
   * 获取用户某类型认证记录
   * @param {number} userId - 用户ID
   * @param {string} type - 认证类型
   * @returns {Promise<Object|null>}
   */
  static async findByUserIdAndType(userId, type) {
    try {
      if (isDbAvailable()) {
        const [rows] = await executeQuery(
          'SELECT * FROM user_verifications WHERE user_id = ? AND verification_type = ? ORDER BY created_at DESC LIMIT 1',
          [userId, type]
        );
        return rows[0] || null;
      }
    } catch (err) {
      console.error('数据库查询认证记录失败，使用内存存储:', err.message);
    }
    const records = Array.from(memoryStore.values())
      .filter(r => r.user_id === userId && r.verification_type === type);
    return records.length > 0 ? records[0] : null;
  }

  /**
   * 检查某类认证是否已存在（不限状态）
   * @param {number} userId - 用户ID
   * @param {string} type - 认证类型
   * @returns {Promise<boolean>}
   */
  static async exists(userId, type) {
    const record = await this.findByUserIdAndType(userId, type);
    return !!record;
  }

  /**
   * 更新认证记录状态（审核用）
   * @param {number} id - 记录ID
   * @param {string} status - 新状态：approved/rejected
   * @param {number|null} reviewedBy - 审核人ID
   * @param {string|null} rejectedReason - 拒绝原因
   * @returns {Promise<Object|null>}
   */
  static async updateStatus(id, status, reviewedBy = null, rejectedReason = null) {
    try {
      if (isDbAvailable()) {
        const fields = ['status = ?', 'reviewed_at = NOW()'];
        const values = [status];
        if (reviewedBy) { fields.push('reviewed_by = ?'); values.push(reviewedBy); }
        if (rejectedReason) { fields.push('rejected_reason = ?'); values.push(rejectedReason); }
        values.push(id);
        await executeQuery(
          `UPDATE user_verifications SET ${fields.join(', ')} WHERE id = ?`,
          values
        );
        return this.findById(id);
      }
    } catch (err) {
      console.error('数据库更新认证记录失败，使用内存存储:', err.message);
    }

    // 内存降级
    const record = memoryStore.get(id);
    if (record) {
      record.status = status;
      record.reviewed_at = new Date();
      if (reviewedBy) record.reviewed_by = reviewedBy;
      if (rejectedReason) record.rejected_reason = rejectedReason;
      record.updated_at = new Date();
      memoryStore.set(id, record);
    }
    return record || null;
  }

  /**
   * 获取待审核的认证列表（管理员用）
   * @param {string} status - 筛选状态，默认pending
   * @param {number} limit - 每页数量
   * @param {number} offset - 偏移量
   * @returns {Promise<Array>}
   */
  static async findAll(status = 'pending', limit = 20, offset = 0) {
    try {
      if (isDbAvailable()) {
        const [rows] = await executeQuery(
          'SELECT * FROM user_verifications WHERE status = ? ORDER BY created_at ASC LIMIT ? OFFSET ?',
          [status, limit, offset]
        );
        return rows;
      }
    } catch (err) {
      console.error('数据库查询认证列表失败，使用内存存储:', err.message);
    }
    return Array.from(memoryStore.values())
      .filter(r => r.status === status)
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
      .slice(offset, offset + limit);
  }
}

module.exports = UserVerification;
