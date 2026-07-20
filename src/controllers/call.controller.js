/**
 * 通话控制器
 * 处理语音/视频通话的HTTP请求
 * 注意：通话信令（发起/接听/拒绝/挂断）主要通过WebSocket实时传输
 * 这些HTTP接口用于通话记录查询和管理
 */

const { success, error, serverError } = require('../utils/response');
const callService = require('../services/call.service');

/**
 * 发起通话
 * POST /api/call/initiate
 * Body: { callee_id, call_type }
 * 返回：{ call_id, channel_name, token, simulate }
 */
async function initiateCall(req, res) {
  try {
    const { id: callerId } = req.user;
    const { callee_id, call_type = 'voice' } = req.body;

    if (!callee_id) {
      return error(res, 400, '请选择通话对象');
    }

    if (callerId === parseInt(callee_id)) {
      return error(res, 400, '不能和自己通话');
    }

    if (!['voice', 'video'].includes(call_type)) {
      return error(res, 400, '通话类型无效，可选 voice 或 video');
    }

    const result = await callService.initiateCall(callerId, parseInt(callee_id), call_type);
    success(res, result, '通话发起成功');
  } catch (err) {
    if (err.message && err.message.includes('拉黑')) {
      return error(res, 403, err.message);
    }
    serverError(res, err, '发起通话失败');
  }
}

/**
 * 接听通话
 * POST /api/call/accept
 * Body: { call_id }
 */
async function acceptCall(req, res) {
  try {
    const { id: userId } = req.user;
    const { call_id } = req.body;

    if (!call_id) {
      return error(res, 400, '缺少通话记录ID');
    }

    const result = await callService.acceptCall(parseInt(call_id), userId);
    success(res, result, '已接听');
  } catch (err) {
    if (err.message && (err.message.includes('不存在') || err.message.includes('无权'))) {
      return error(res, 403, err.message);
    }
    serverError(res, err, '接听通话失败');
  }
}

/**
 * 拒绝通话
 * POST /api/call/reject
 * Body: { call_id, caller_id }
 */
async function rejectCall(req, res) {
  try {
    const { id: userId } = req.user;
    const { call_id, caller_id } = req.body;

    const result = await callService.rejectCall(
      call_id ? parseInt(call_id) : null,
      userId,
      caller_id ? parseInt(caller_id) : null
    );
    success(res, result, '已拒绝');
  } catch (err) {
    serverError(res, err, '拒绝通话失败');
  }
}

/**
 * 挂断通话
 * POST /api/call/end
 * Body: { call_id }
 */
async function endCall(req, res) {
  try {
    const { id: userId } = req.user;
    const { call_id, end_reason } = req.body;

    if (!call_id) {
      return error(res, 400, '缺少通话记录ID');
    }

    const result = await callService.endCall(parseInt(call_id), userId, end_reason || 'hangup');
    success(res, result, '通话已结束');
  } catch (err) {
    serverError(res, err, '结束通话失败');
  }
}

/**
 * 获取通话历史
 * GET /api/call/history?page=1&pageSize=20
 */
async function getCallHistory(req, res) {
  try {
    const { id: userId } = req.user;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const pageSize = Math.min(50, Math.max(1, parseInt(req.query.pageSize) || 20));

    const result = await callService.getCallHistory(userId, page, pageSize);
    success(res, result);
  } catch (err) {
    serverError(res, err, '获取通话历史失败');
  }
}

module.exports = {
  initiateCall,
  acceptCall,
  rejectCall,
  endCall,
  getCallHistory
};
