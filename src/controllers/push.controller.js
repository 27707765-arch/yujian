/**
 * 推送控制器
 * 处理设备Token注册/注销
 */

const PushToken = require('../models/PushToken');
const { success, error, serverError } = require('../utils/response');

/**
 * 注册设备Token
 * @param {Object} req - Express请求对象
 * @param {Object} res - Express响应对象
 */
async function registerToken(req, res) {
  try {
    const { id } = req.user;
    const { platform, device_token } = req.body;

    if (!platform || !device_token) {
      return error(res, 400, '平台和设备Token不能为空');
    }

    if (!['ios', 'android', 'web'].includes(platform)) {
      return error(res, 400, '平台仅支持 ios/android/web');
    }

    await PushToken.register(id, platform, device_token);
    success(res, null, '设备注册成功');
  } catch (err) {
    serverError(res, err, '设备注册失败');
  }
}

/**
 * 注销设备Token
 * @param {Object} req - Express请求对象
 * @param {Object} res - Express响应对象
 */
async function unregisterToken(req, res) {
  try {
    const { id } = req.user;
    const { device_token } = req.body;

    if (!device_token) {
      return error(res, 400, '设备Token不能为空');
    }

    await PushToken.unregister(id, device_token);
    success(res, null, '设备注销成功');
  } catch (err) {
    serverError(res, err, '设备注销失败');
  }
}

module.exports = { registerToken, unregisterToken };
