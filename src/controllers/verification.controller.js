/**
 * 认证控制器
 * 处理多重身份认证的HTTP请求
 * 包括：实名认证、人脸认证、学历认证、车辆认证
 */

const { success, error, serverError } = require('../utils/response');
const verificationService = require('../services/verification.service');

/**
 * 提交实名认证
 * POST /api/verification/real-name
 * Body: { real_name, id_card_number, id_card_front_url, id_card_back_url }
 */
async function submitRealNameVerification(req, res) {
  try {
    const { id } = req.user;
    const result = await verificationService.submitRealName(id, req.body);
    success(res, result);
  } catch (err) {
    if (err.message && (err.message.includes('已完成') || err.message.includes('审核中') || err.message.includes('格式不正确') || err.message.includes('请填写'))) {
      return error(res, 400, err.message);
    }
    serverError(res, err, '实名认证提交失败');
  }
}

/**
 * 提交人脸认证
 * POST /api/verification/face
 * Body: { face_image_url, face_video_url, id_card_front_url }
 */
async function submitFaceVerification(req, res) {
  try {
    const { id } = req.user;
    const result = await verificationService.submitFace(id, req.body);
    success(res, result);
  } catch (err) {
    if (err.message && (err.message.includes('已完成') || err.message.includes('审核中') || err.message.includes('请上传'))) {
      return error(res, 400, err.message);
    }
    serverError(res, err, '人脸认证提交失败');
  }
}

/**
 * 提交学历认证
 * POST /api/verification/education
 * Body: { school_name, education_level, graduation_year, education_cert_url }
 */
async function submitEducationVerification(req, res) {
  try {
    const { id } = req.user;
    const result = await verificationService.submitEducation(id, req.body);
    success(res, result);
  } catch (err) {
    if (err.message && (err.message.includes('已完成') || err.message.includes('审核中') || err.message.includes('请填写') || err.message.includes('请选择') || err.message.includes('请上传') || err.message.includes('不合法'))) {
      return error(res, 400, err.message);
    }
    serverError(res, err, '学历认证提交失败');
  }
}

/**
 * 提交车辆认证
 * POST /api/verification/vehicle
 * Body: { car_brand, car_model, driving_license_url }
 */
async function submitVehicleVerification(req, res) {
  try {
    const { id } = req.user;
    const result = await verificationService.submitVehicle(id, req.body);
    success(res, result);
  } catch (err) {
    if (err.message && (err.message.includes('已完成') || err.message.includes('审核中') || err.message.includes('请填写') || err.message.includes('请上传'))) {
      return error(res, 400, err.message);
    }
    serverError(res, err, '车辆认证提交失败');
  }
}

/**
 * 获取用户所有认证状态
 * GET /api/verification/status
 */
async function getVerificationStatus(req, res) {
  try {
    const { id } = req.user;
    const result = await verificationService.getVerificationStatus(id);
    success(res, result);
  } catch (err) {
    if (err.message === '用户不存在') {
      return error(res, 404, err.message);
    }
    serverError(res, err, '获取认证状态失败');
  }
}

/**
 * 获取某类认证的详细记录
 * GET /api/verification/detail/:type
 */
async function getVerificationDetail(req, res) {
  try {
    const { id } = req.user;
    const { type } = req.params;
    const result = await verificationService.getVerificationDetail(id, type);
    success(res, result || null, result ? '查询成功' : '暂无该类型认证记录');
  } catch (err) {
    if (err.message && err.message.includes('无效的认证类型')) {
      return error(res, 400, err.message);
    }
    serverError(res, err, '获取认证详情失败');
  }
}

module.exports = {
  submitRealNameVerification,
  submitFaceVerification,
  submitEducationVerification,
  submitVehicleVerification,
  getVerificationStatus,
  getVerificationDetail
};
