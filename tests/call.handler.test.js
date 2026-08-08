/**
 * WebSocket 通话信令 handler（call.handler）单元测试
 * 覆盖本次语音通话新增逻辑：
 * - call_request：WebRTC offer 透传（发起方→接听方）
 * - call_accept：answer sdp 透传（接听方→发起方）
 * - call_end：timeout 超时无人接听 → markMissed 标记 missed
 * - 拉黑 / 离线 / ICE 转发 分支（回归保护）
 *
 * 说明：call.js 内部用 CJS require 引入 Block/call.service/websocket.service，
 * Vitest 的 ESM vi.mock 对无扩展名 require 无法命中。故改为：
 * 用 createRequire 先加载真实 CJS 单例模块，再 vi.spyOn 替换方法，
 * call.js 的 require 命中同一实例，spy 即生效。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const Block = require('../src/models/Block');
const callService = require('../src/services/call.service');
const websocketService = require('../src/services/websocket.service');

import { handleCallRequest, handleCallAccept, handleCallEnd, handleIceCandidate } from '../src/ws/handlers/call.js';

let spyBlock, spyCallSvc, spyWs;

beforeEach(() => {
  vi.restoreAllMocks();
  spyBlock = vi.spyOn(Block, 'isMutualBlocked');
  spyCallSvc = {
    initiateCall: vi.spyOn(callService, 'initiateCall'),
    acceptCall: vi.spyOn(callService, 'acceptCall'),
    rejectCall: vi.spyOn(callService, 'rejectCall'),
    endCall: vi.spyOn(callService, 'endCall'),
    generateToken: vi.spyOn(callService, 'generateToken'),
    markMissed: vi.spyOn(callService, 'markMissed'),
  };
  spyWs = {
    sendToUser: vi.spyOn(websocketService, 'sendToUser'),
    isUserOnline: vi.spyOn(websocketService, 'isUserOnline'),
  };
});

// 收集某类型事件的推送 payload
function sentEvents() {
  return spyWs.sendToUser.mock.calls.map(([userId, payload]) => ({ userId, ...payload }));
}
function sentTo(userId, type) {
  return sentEvents().find(e => e.userId === userId && e.type === type);
}

describe('handleCallRequest', () => {
  it('拉黑关系：给发起方发 call_blocked，不转发', async () => {
    spyBlock.mockResolvedValue(true);
    await handleCallRequest(1, { receiver_id: 2, call_type: 'voice' });
    expect(sentTo(1, 'call_blocked')).toBeTruthy();
    expect(sentTo(2, 'call_request')).toBeFalsy();
    expect(spyCallSvc.initiateCall).not.toHaveBeenCalled();
  });

  it('对方离线：给发起方发 call_user_offline，不转发', async () => {
    spyBlock.mockResolvedValue(false);
    spyWs.isUserOnline.mockReturnValue(false);
    await handleCallRequest(1, { receiver_id: 2, call_type: 'voice' });
    expect(sentTo(1, 'call_user_offline')).toBeTruthy();
    expect(sentTo(2, 'call_request')).toBeFalsy();
  });

  it('成功发起：转发 call_request 含 offer，给发起方发 call_initiated', async () => {
    spyBlock.mockResolvedValue(false);
    spyWs.isUserOnline.mockReturnValue(true);
    spyCallSvc.initiateCall.mockResolvedValue({
      call_id: 99, channel_name: 'call_1_2_123', token: 'tok', simulate: true
    });
    await handleCallRequest(1, { receiver_id: 2, call_type: 'voice', offer: 'sdp-offer-abc' });

    const req = sentTo(2, 'call_request');
    expect(req).toBeTruthy();
    expect(req.data.caller_id).toBe(1);
    expect(req.data.call_type).toBe('voice');
    expect(req.data.offer).toBe('sdp-offer-abc');
    expect(req.data.call_id).toBe(99);

    const init = sentTo(1, 'call_initiated');
    expect(init).toBeTruthy();
    expect(init.data.call_id).toBe(99);
  });

  it('无 offer 时透传 null，不破坏现有信令', async () => {
    spyBlock.mockResolvedValue(false);
    spyWs.isUserOnline.mockReturnValue(true);
    spyCallSvc.initiateCall.mockResolvedValue({ call_id: 1, channel_name: 'c', token: 't', simulate: true });
    await handleCallRequest(1, { receiver_id: 2, call_type: 'voice' });
    expect(sentTo(2, 'call_request').data.offer).toBeNull();
  });
});

describe('handleCallAccept', () => {
  it('透传 answer sdp 给发起方，并更新通话记录为 connected', async () => {
    spyCallSvc.acceptCall.mockResolvedValue({ success: true });
    spyCallSvc.generateToken.mockReturnValue('callee-token');
    await handleCallAccept(2, { caller_id: 1, call_id: 99, channel_name: 'call_1_2_123', sdp: 'sdp-answer-xyz' });

    expect(spyCallSvc.acceptCall).toHaveBeenCalledWith(99, 2);
    const accepted = sentTo(1, 'call_accepted');
    expect(accepted).toBeTruthy();
    expect(accepted.data.sdp).toBe('sdp-answer-xyz');
    expect(accepted.data.call_id).toBe(99);
  });

  it('无 sdp 时透传 null，兼容旧版信令', async () => {
    spyCallSvc.acceptCall.mockResolvedValue({ success: true });
    spyCallSvc.generateToken.mockReturnValue('callee-token');
    await handleCallAccept(2, { caller_id: 1, call_id: 99, channel_name: 'c' });
    expect(sentTo(1, 'call_accepted').data.sdp).toBeNull();
  });
});

describe('handleCallEnd', () => {
  it('timeout 超时：调用 markMissed 标记 missed，不调用 endCall', async () => {
    spyCallSvc.markMissed.mockResolvedValue({ success: true });
    await handleCallEnd(1, { peer_id: 2, call_id: 99, end_reason: 'timeout' });
    expect(spyCallSvc.markMissed).toHaveBeenCalledWith(99);
    expect(spyCallSvc.endCall).not.toHaveBeenCalled();
    const ended = sentTo(2, 'call_ended');
    expect(ended).toBeTruthy();
    expect(ended.data.end_reason).toBe('timeout');
  });

  it('hangup 挂断：调用 endCall 并把时长传给对方', async () => {
    spyCallSvc.endCall.mockResolvedValue({ success: true, duration: 65 });
    await handleCallEnd(1, { peer_id: 2, call_id: 99, end_reason: 'hangup' });
    expect(spyCallSvc.endCall).toHaveBeenCalledWith(99, 1, 'hangup');
    expect(sentTo(2, 'call_ended').data.duration).toBe(65);
  });
});

describe('handleIceCandidate', () => {
  it('转发 ICE candidate 给对端', () => {
    const cand = { candidate: 'candidate:1 1 udp 2130706431 192.168.1.1 54321 typ host' };
    handleIceCandidate(1, { peer_id: 2, candidate: cand });
    expect(sentTo(2, 'ice_candidate').data.candidate).toBe(cand);
  });

  it('缺 candidate 或 peer_id 不转发', () => {
    handleIceCandidate(1, { peer_id: 2 });
    handleIceCandidate(1, { candidate: 'x' });
    expect(spyWs.sendToUser).not.toHaveBeenCalled();
  });
});
