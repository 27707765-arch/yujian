/**
 * 通话服务
 * 管理语音/视频通话业务逻辑：Token生成、通话记录、状态流转
 * Agora Token生成在无配置时自动降级为模拟模式
 */

const CallRecord = require('../models/CallRecord');
const Block = require('../models/Block');

class CallService {
  constructor() {
    this.appId = process.env.AGORA_APP_ID || null;
    this.appCertificate = process.env.AGORA_APP_CERTIFICATE || null;
    this.tokenExpireSeconds = parseInt(process.env.AGORA_TOKEN_EXPIRE_SECONDS, 10) || 3600;
    this.isSimulateMode = !this.appId || !this.appCertificate;
  }

  /**
   * 生成Agora Token（或模拟Token）
   * @param {string} channelName - 频道名
   * @param {number} uid - 用户ID
   * @param {string} role - 角色：publisher/subscriber
   * @returns {string} - Token字符串
   */
  generateToken(channelName, uid, role = 'publisher') {
    if (this.isSimulateMode) {
      // [MOCK] 模拟模式：返回一个占位token
      const currentTimestamp = Math.floor(Date.now() / 1000);
      const expireTs = currentTimestamp + this.tokenExpireSeconds;
      return `mock_agora_token_${channelName}_${uid}_${role}_${expireTs}`;
    }

    // 生产环境：使用 Agora RTC Token Builder
    try {
      const { RtcTokenBuilder, RtcRole } = require('agora-access-token');
      const currentTimestamp = Math.floor(Date.now() / 1000);
      const privilegeExpiredTs = currentTimestamp + this.tokenExpireSeconds;
      return RtcTokenBuilder.buildTokenWithUid(
        this.appId, this.appCertificate, channelName, uid,
        role === 'publisher' ? RtcRole.PUBLISHER : RtcRole.SUBSCRIBER,
        privilegeExpiredTs
      );
    } catch (err) {
      // agora-access-token 未安装时降级为模拟
      console.warn('[CallService] agora-access-token 未安装，使用模拟Token');
      return this.generateToken(channelName, uid, role); // 走模拟分支
    }
  }

  /**
   * 获取模拟模式信息（前端据此判断是否尝试真实P2P连接）
   * @returns {Object}
   */
  getModeInfo() {
    return {
      simulate: this.isSimulateMode,
      appId: this.appId || 'mock_app_id',
      tokenExpireSeconds: this.tokenExpireSeconds
    };
  }

  /**
   * 发起通话
   * @param {number} callerId - 发起方用户ID
   * @param {number} calleeId - 接收方用户ID
   * @param {string} callType - 通话类型：voice/video
   * @returns {Promise<Object>} - { call_id, channel_name, token, simulate }
   */
  async initiateCall(callerId, calleeId, callType = 'voice') {
    // 拉黑检测
    const isBlocked = await Block.isMutualBlocked(callerId, calleeId);
    if (isBlocked) {
      throw new Error('无法发起通话，存在拉黑关系');
    }

    const channelName = `call_${callerId}_${calleeId}_${Date.now()}`;
    const callerToken = this.generateToken(channelName, callerId);

    const record = await CallRecord.create({
      channel_name: channelName,
      caller_id: callerId,
      callee_id: calleeId,
      call_type: callType,
      status: 'ringing'
    });

    return {
      call_id: record.id,
      channel_name: channelName,
      token: callerToken,
      simulate: this.isSimulateMode,
      mode_info: this.getModeInfo()
    };
  }

  /**
   * 接听通话
   * @param {number} callId - 通话记录ID
   * @param {number} userId - 接听用户ID
   * @returns {Promise<Object>}
   */
  async acceptCall(callId, userId) {
    const record = await CallRecord.findById(callId);
    if (!record) throw new Error('通话记录不存在');
    if (record.callee_id !== userId) throw new Error('无权接听此通话');

    await CallRecord.update(callId, {
      status: 'connected',
      connected_at: new Date()
    });

    const calleeToken = this.generateToken(record.channel_name, userId);
    return {
      success: true,
      call_id: callId,
      channel_name: record.channel_name,
      token: calleeToken,
      simulate: this.isSimulateMode
    };
  }

  /**
   * 拒绝通话
   * @param {number} callId - 通话记录ID（或通过caller_id+callee_id+channel_name匹配）
   * @param {number} userId - 拒绝用户ID
   * @param {number} callerId - 发起方ID（用于匹配记录）
   * @returns {Promise<Object>}
   */
  async rejectCall(callId, userId, callerId) {
    let record = callId ? await CallRecord.findById(callId) : null;

    // 如果通过ID找不到，尝试通过参与者匹配最近的记录
    if (!record && callerId) {
      const calls = await CallRecord.getUserCalls(userId, 1, 0);
      record = calls.find(c =>
        c.caller_id === callerId &&
        c.callee_id === userId &&
        c.status === 'ringing'
      ) || null;
    }

    if (!record) {
      // 找不到记录时仍然返回成功（可能记录还未写入）
      return { success: true, message: '已拒绝通话' };
    }

    await CallRecord.update(record.id, {
      status: 'rejected',
      ended_at: new Date(),
      end_reason: 'rejected'
    });

    return { success: true, call_id: record.id };
  }

  /**
   * 结束通话（挂断）
   * @param {number} callId - 通话记录ID
   * @param {number} userId - 挂断用户ID
   * @param {string} endReason - 结束原因：hangup/timeout/network
   * @returns {Promise<Object>}
   */
  async endCall(callId, userId, endReason = 'hangup') {
    const record = await CallRecord.findById(callId);
    if (!record) {
      return { success: true, message: '通话记录不存在' };
    }

    // 计算通话时长
    let duration = 0;
    if (record.connected_at) {
      duration = Math.floor((Date.now() - new Date(record.connected_at).getTime()) / 1000);
    }

    await CallRecord.update(callId, {
      status: 'ended',
      ended_at: new Date(),
      duration: Math.max(0, duration),
      end_reason: endReason
    });

    return { success: true, call_id: callId, duration };
  }

  /**
   * 获取用户通话历史
   * @param {number} userId - 用户ID
   * @param {number} page - 页码
   * @param {number} pageSize - 每页数量
   * @returns {Promise<Object>} - { list, total, page, pageSize }
   */
  async getCallHistory(userId, page = 1, pageSize = 20) {
    const offset = (page - 1) * pageSize;
    const list = await CallRecord.getUserCalls(userId, pageSize, offset);
    return {
      list,
      page,
      page_size: pageSize
    };
  }

  /**
   * 标记通话为未接听
   * @param {number} callId - 通话记录ID
   * @returns {Promise<void>}
   */
  async markMissed(callId) {
    const record = await CallRecord.findById(callId);
    if (record && record.status === 'ringing') {
      await CallRecord.update(callId, {
        status: 'missed',
        ended_at: new Date(),
        end_reason: 'no_answer'
      });
    }
  }
}

module.exports = new CallService();
