/**
 * 认证服务
 * 处理OCR识别、人脸比对、活体检测等认证业务逻辑
 * 初期使用模拟实现（标记为 [MOCK]），后续可接入阿里云/腾讯云实名认证API
 */

const UserVerification = require('../models/UserVerification');
const User = require('../models/User');

class VerificationService {
  /**
   * [MOCK] OCR识别身份证信息
   * 生产环境应接入阿里云OCR身份证识别API
   * @param {string} imageUrl - 身份证图片URL
   * @returns {Promise<Object>} - { name, id_number, gender, birth, address }
   */
  static async recognizeIdCard(imageUrl) {
    // TODO: 接入真实OCR识别API
    // 阿里云OCR: https://help.aliyun.com/document_detail/151846.html
    // 腾讯云OCR: https://cloud.tencent.com/document/api/866/33524
    console.log(`[MOCK] OCR识别身份证: ${imageUrl}`);
    return {
      name: '张三',
      id_number: '110101199001011234',
      gender: '男',
      birth: '1990-01-01',
      address: '北京市东城区'
    };
  }

  /**
   * [MOCK] 人脸比对
   * 生产环境应接入阿里云/腾讯云人脸比对API
   * @param {string} image1Url - 自拍照URL
   * @param {string} image2Url - 身份证照片URL
   * @returns {Promise<Object>} - { match: boolean, confidence: number }
   */
  static async compareFaces(image1Url, image2Url) {
    // TODO: 接入真实人脸比对API
    // 阿里云人脸比对: https://help.aliyun.com/document_detail/151891.html
    // 腾讯云人脸比对: https://cloud.tencent.com/document/api/867/32802
    console.log(`[MOCK] 人脸比对: ${image1Url} vs ${image2Url}`);
    return { match: true, confidence: 95.5 };
  }

  /**
   * [MOCK] 活体检测
   * 生产环境应接入阿里云/腾讯云活体检测API
   * @param {string} videoUrl - 活体检测视频URL
   * @returns {Promise<Object>} - { is_live: boolean, confidence: number }
   */
  static async livenessDetection(videoUrl) {
    // TODO: 接入真实活体检测API
    // 阿里云活体检测: https://help.aliyun.com/document_detail/152443.html
    console.log(`[MOCK] 活体检测: ${videoUrl}`);
    return { is_live: true, confidence: 98.2 };
  }

  /**
   * 计算用户认证等级（0-4）
   * @param {Object} user - 用户对象
   * @returns {number} - 认证等级
   */
  static calculateVerificationLevel(user) {
    let level = 0;
    if (user.is_real_name_verified) level++;
    if (user.is_face_verified) level++;
    if (user.is_education_verified) level++;
    if (user.is_vehicle_verified) level++;
    return level;
  }

  /**
   * 获取用户认证徽章列表
   * @param {Object} user - 用户对象
   * @returns {string[]} - 徽章名称数组
   */
  static getVerificationBadges(user) {
    const badges = [];
    if (user.is_real_name_verified) badges.push('real_name');
    if (user.is_face_verified) badges.push('face');
    if (user.is_education_verified) badges.push('education');
    if (user.is_vehicle_verified) badges.push('vehicle');
    return badges;
  }

  /**
   * 同步认证状态到 users 表（更新认证标记、等级、徽章）
   * @param {number} userId - 用户ID
   * @returns {Promise<Object|null>} - 更新后的用户对象
   */
  static async updateUserVerificationFlags(userId) {
    const records = await UserVerification.findByUserId(userId);
    const user = await User.findById(userId);
    if (!user) return null;

    // 按类型取最新一条已通过的记录
    const approvedMap = {};
    for (const r of records) {
      if (r.status === 'approved') {
        const type = r.verification_type;
        if (!approvedMap[type]) approvedMap[type] = r;
      }
    }

    const updateData = {
      is_real_name_verified: approvedMap.real_name ? 1 : 0,
      is_face_verified: approvedMap.face ? 1 : 0,
      is_education_verified: approvedMap.education ? 1 : 0,
      is_vehicle_verified: approvedMap.vehicle ? 1 : 0,
    };

    updateData.verification_level = this.calculateVerificationLevel(updateData);
    updateData.verified_badges = JSON.stringify(this.getVerificationBadges(updateData));

    return User.update(userId, updateData);
  }

  /**
   * 提交实名认证
   * @param {number} userId - 用户ID
   * @param {Object} submitData - 提交数据
   * @param {string} submitData.real_name - 真实姓名
   * @param {string} submitData.id_card_number - 身份证号
   * @param {string} submitData.id_card_front_url - 身份证正面URL
   * @param {string} submitData.id_card_back_url - 身份证反面URL
   * @returns {Promise<Object>} - { success, message, record }
   */
  static async submitRealName(userId, submitData) {
    // 检查是否已有认证记录
    const existing = await UserVerification.findByUserIdAndType(userId, 'real_name');
    if (existing) {
      if (existing.status === 'approved') {
        throw new Error('您已完成实名认证，无需重复提交');
      }
      if (existing.status === 'pending') {
        throw new Error('您的实名认证正在审核中，请耐心等待');
      }
    }

    const { real_name, id_card_number, id_card_front_url, id_card_back_url } = submitData;

    // 基本参数验证
    if (!real_name || real_name.length < 2) {
      throw new Error('请填写真实姓名');
    }
    if (!id_card_number || !/^\d{17}[\dXx]$/.test(id_card_number)) {
      throw new Error('身份证号格式不正确');
    }

    // [MOCK] OCR识别（生产环境会自动识别并校验）
    // const ocrResult = await this.recognizeIdCard(id_card_front_url);
    // 模拟：OCR通过，自动审核通过
    const APPROVE_AUTO = true; // 模拟模式下自动通过

    const record = await UserVerification.create(userId, 'real_name', {
      real_name,
      id_card_number,
      id_card_front_url,
      id_card_back_url
    });

    if (APPROVE_AUTO) {
      await UserVerification.updateStatus(record.id, 'approved');
      await this.updateUserVerificationFlags(userId);
    }

    return {
      success: true,
      message: APPROVE_AUTO ? '实名认证提交成功，已自动通过审核' : '实名认证已提交，请等待审核',
      record: await UserVerification.findById(record.id)
    };
  }

  /**
   * 提交人脸认证
   * @param {number} userId - 用户ID
   * @param {Object} submitData - 提交数据
   * @param {string} submitData.face_image_url - 人脸自拍URL
   * @param {string} submitData.face_video_url - 活体检测视频URL
   * @param {string} submitData.id_card_front_url - 身份证正面URL（用于比对）
   * @returns {Promise<Object>}
   */
  static async submitFace(userId, submitData) {
    const existing = await UserVerification.findByUserIdAndType(userId, 'face');
    if (existing) {
      if (existing.status === 'approved') throw new Error('您已完成人脸认证');
      if (existing.status === 'pending') throw new Error('您的人脸认证正在审核中');
    }

    const { face_image_url, face_video_url, id_card_front_url } = submitData;

    if (!face_image_url) throw new Error('请上传人脸照片');
    if (!face_video_url) throw new Error('请上传活体检测视频');

    // [MOCK] 人脸比对 + 活体检测
    // const faceResult = await this.compareFaces(face_image_url, id_card_front_url);
    // const livenessResult = await this.livenessDetection(face_video_url);
    const APPROVE_AUTO = true; // 模拟模式下自动通过

    const record = await UserVerification.create(userId, 'face', {
      face_image_url,
      face_video_url,
      id_card_front_url
    });

    if (APPROVE_AUTO) {
      await UserVerification.updateStatus(record.id, 'approved');
      await this.updateUserVerificationFlags(userId);
    }

    return {
      success: true,
      message: APPROVE_AUTO ? '人脸认证提交成功，已自动通过审核' : '人脸认证已提交，请等待审核',
      record: await UserVerification.findById(record.id)
    };
  }

  /**
   * 提交学历认证
   * @param {number} userId - 用户ID
   * @param {Object} submitData - 提交数据
   * @param {string} submitData.school_name - 学校名称
   * @param {string} submitData.education_level - 学历层次
   * @param {number} submitData.graduation_year - 毕业年份
   * @param {string} submitData.education_cert_url - 学历证书URL
   * @returns {Promise<Object>}
   */
  static async submitEducation(userId, submitData) {
    const existing = await UserVerification.findByUserIdAndType(userId, 'education');
    if (existing) {
      if (existing.status === 'approved') throw new Error('您已完成学历认证');
      if (existing.status === 'pending') throw new Error('您的学历认证正在审核中');
    }

    const { school_name, education_level, graduation_year, education_cert_url } = submitData;

    if (!school_name) throw new Error('请填写学校名称');
    if (!education_level) throw new Error('请选择学历层次');
    if (!graduation_year || graduation_year < 1950 || graduation_year > new Date().getFullYear()) {
      throw new Error('毕业年份不合法');
    }
    if (!education_cert_url) throw new Error('请上传学历证书');

    const APPROVE_AUTO = true; // 模拟模式下自动通过

    const record = await UserVerification.create(userId, 'education', {
      school_name,
      education_level,
      graduation_year,
      education_cert_url
    });

    if (APPROVE_AUTO) {
      await UserVerification.updateStatus(record.id, 'approved');
      await this.updateUserVerificationFlags(userId);
    }

    return {
      success: true,
      message: APPROVE_AUTO ? '学历认证提交成功，已自动通过审核' : '学历认证已提交，请等待审核',
      record: await UserVerification.findById(record.id)
    };
  }

  /**
   * 提交车辆认证
   * @param {number} userId - 用户ID
   * @param {Object} submitData - 提交数据
   * @param {string} submitData.car_brand - 车辆品牌
   * @param {string} submitData.car_model - 车辆型号
   * @param {string} submitData.driving_license_url - 驾驶证URL
   * @returns {Promise<Object>}
   */
  static async submitVehicle(userId, submitData) {
    const existing = await UserVerification.findByUserIdAndType(userId, 'vehicle');
    if (existing) {
      if (existing.status === 'approved') throw new Error('您已完成车辆认证');
      if (existing.status === 'pending') throw new Error('您的车辆认证正在审核中');
    }

    const { car_brand, car_model, driving_license_url } = submitData;

    if (!car_brand) throw new Error('请填写车辆品牌');
    if (!driving_license_url) throw new Error('请上传驾驶证');

    const APPROVE_AUTO = true; // 模拟模式下自动通过

    const record = await UserVerification.create(userId, 'vehicle', {
      car_brand,
      car_model,
      driving_license_url
    });

    if (APPROVE_AUTO) {
      await UserVerification.updateStatus(record.id, 'approved');
      await this.updateUserVerificationFlags(userId);
    }

    return {
      success: true,
      message: APPROVE_AUTO ? '车辆认证提交成功，已自动通过审核' : '车辆认证已提交，请等待审核',
      record: await UserVerification.findById(record.id)
    };
  }

  /**
   * 获取用户所有认证状态汇总
   * @param {number} userId - 用户ID
   * @returns {Promise<Object>} - 各类型认证状态 + 等级 + 徽章
   */
  static async getVerificationStatus(userId) {
    const user = await User.findById(userId);
    if (!user) throw new Error('用户不存在');

    const records = await UserVerification.findByUserId(userId);

    // 按类型取最新状态
    const statusMap = {
      real_name: { status: 'none', detail: null },
      face: { status: 'none', detail: null },
      education: { status: 'none', detail: null },
      vehicle: { status: 'none', detail: null },
      income: { status: 'none', detail: null }
    };

    for (const r of records) {
      const type = r.verification_type;
      if (statusMap[type]) {
        statusMap[type] = {
          status: r.status,
          created_at: r.created_at,
          reviewed_at: r.reviewed_at,
          rejected_reason: r.rejected_reason
        };
      }
    }

    return {
      verifications: statusMap,
      level: user.verification_level || 0,
      badges: (() => {
        try { return typeof user.verified_badges === 'string' ? JSON.parse(user.verified_badges) : (user.verified_badges || []); }
        catch (e) { return []; }
      })(),
      is_real_name_verified: !!user.is_real_name_verified,
      is_face_verified: !!user.is_face_verified,
      is_education_verified: !!user.is_education_verified,
      is_vehicle_verified: !!user.is_vehicle_verified
    };
  }

  /**
   * 获取某类认证的详细记录
   * @param {number} userId - 用户ID
   * @param {string} type - 认证类型
   * @returns {Promise<Object|null>}
   */
  static async getVerificationDetail(userId, type) {
    const validTypes = ['real_name', 'face', 'education', 'vehicle', 'income'];
    if (!validTypes.includes(type)) {
      throw new Error('无效的认证类型：' + type);
    }
    return UserVerification.findByUserIdAndType(userId, type);
  }
}

module.exports = VerificationService;
