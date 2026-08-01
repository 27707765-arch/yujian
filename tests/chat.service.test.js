/**
 * 聊天服务（chat.service）单元测试
 * 通过 createChatService 依赖注入 stub，验证 S9 收敛点的关键分支：
 * - 消息类型多态（文本/礼物/语音）
 * - 敏感词拦截（contentAudit 阻断）
 * - 反欺诈拦截
 * - 拉黑检测
 * - 会话校验 / 成员权限
 * - 离线消息存储
 * - 撤回归属校验 + 双端推送
 * 全部依赖 stub，无 DB/WS 连接。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createChatService } from '../src/services/chat.service.js';

function makeStubs() {
  const stubs = {
    Conversation: {
      findById: vi.fn(),
      createOrGet: vi.fn(),
    },
    Message: {
      create: vi.fn(),
      recall: vi.fn(),
    },
    Block: {
      isMutualBlocked: vi.fn(),
    },
    User: {
      findById: vi.fn(),
    },
    websocketService: {
      sendToUser: vi.fn(),
      isUserOnline: vi.fn(),
    },
    contentAuditService: {
      checkSensitiveContent: vi.fn(),
      filterSensitiveContent: vi.fn(),
    },
    antifraudService: {
      checkMessageBehavior: vi.fn(),
    },
    offlineMessageService: {
      storeMessage: vi.fn(),
    },
    intimacyService: {
      onChatMessage: vi.fn(),
    },
  };
  return stubs;
}

// 构造一条最小消息对象（Message.create 的返回值）
function makeMessage(overrides = {}) {
  return {
    id: 101,
    conversation_id: 50,
    sender_id: 1,
    receiver_id: 2,
    content: '你好',
    type: 0,
    status: 'sent',
    created_at: '2026-08-01T00:00:00Z',
    ...overrides,
  };
}

describe('chat.service.sendMessage（依赖注入）', () => {
  let stubs;
  let chatService;

  beforeEach(() => {
    stubs = makeStubs();
    // 默认放行
    stubs.Conversation.findById.mockResolvedValue({ id: 50, user1_id: 1, user2_id: 2 });
    stubs.Block.isMutualBlocked.mockResolvedValue(false);
    stubs.contentAuditService.checkSensitiveContent.mockReturnValue({ pass: true });
    stubs.contentAuditService.filterSensitiveContent.mockImplementation((c) => c);
    stubs.antifraudService.checkMessageBehavior.mockResolvedValue({ blocked: false });
    stubs.User.findById.mockResolvedValue({ id: 1, nickname: '测试', avatar: null });
    stubs.Message.create.mockImplementation(async (data) => makeMessage(data));
    stubs.websocketService.sendToUser.mockReturnValue(true);
    stubs.websocketService.isUserOnline.mockReturnValue(true);
    stubs.offlineMessageService.storeMessage.mockResolvedValue();
    stubs.intimacyService.onChatMessage.mockResolvedValue();

    chatService = createChatService(stubs);
  });

  it('无会话ID且无接收者 → 参数错误', async () => {
    const r = await chatService.sendMessage({ sender_id: 1 });
    expect(r.success).toBe(false);
    expect(r.message).toContain('不能为空');
  });

  it('会话不存在 → 返回错误', async () => {
    stubs.Conversation.findById.mockResolvedValue(null);
    const r = await chatService.sendMessage({ sender_id: 1, conversation_id: 999 });
    expect(r.success).toBe(false);
    expect(r.message).toContain('会话不存在');
  });

  it('会话成员校验失败 → 无权访问', async () => {
    stubs.Conversation.findById.mockResolvedValue({ id: 50, user1_id: 9, user2_id: 8 });
    const r = await chatService.sendMessage({ sender_id: 1, conversation_id: 50, content: 'hi' });
    expect(r.success).toBe(false);
    expect(r.message).toContain('无权访问');
  });

  it('文本消息正常发送，落库并 WS 推送', async () => {
    const r = await chatService.sendMessage({ sender_id: 1, conversation_id: 50, content: '你好呀' });
    expect(r.success).toBe(true);
    // 落库参数：receiver 从会话推导 = 2
    expect(stubs.Message.create).toHaveBeenCalledWith(expect.objectContaining({
      conversation_id: 50, sender_id: 1, receiver_id: 2, content: '你好呀', type: 0,
    }));
    // WS 推送
    expect(stubs.websocketService.sendToUser).toHaveBeenCalledWith(2, expect.objectContaining({ type: 'message' }));
    expect(r.delivered).toBe(true);
  });

  it('敏感词命中 → 审核拦截（blocked）', async () => {
    stubs.contentAuditService.checkSensitiveContent.mockReturnValue({ pass: false, message: '内容包含敏感词: 赌博' });
    const r = await chatService.sendMessage({ sender_id: 1, conversation_id: 50, content: '我们赌博吗' });
    expect(r.success).toBe(false);
    expect(r.blocked).toBe(true);
    expect(stubs.Message.create).not.toHaveBeenCalled();
  });

  it('反欺诈命中 → 拦截', async () => {
    stubs.antifraudService.checkMessageBehavior.mockResolvedValue({ blocked: true });
    const r = await chatService.sendMessage({ sender_id: 1, conversation_id: 50, content: '你好' });
    expect(r.success).toBe(false);
    expect(r.blocked).toBe(true);
  });

  it('存在拉黑关系 → 拦截', async () => {
    stubs.Block.isMutualBlocked.mockResolvedValue(true);
    const r = await chatService.sendMessage({ sender_id: 1, conversation_id: 50, content: '你好' });
    expect(r.success).toBe(false);
    expect(r.blocked).toBe(true);
    expect(r.reason).toContain('拉黑');
  });

  it('无会话时按 receiver 创建/获取会话', async () => {
    stubs.Conversation.createOrGet.mockResolvedValue({ id: 77, user1_id: 1, user2_id: 2 });
    const r = await chatService.sendMessage({ sender_id: 1, receiver_id: 2, content: 'hello' });
    expect(r.success).toBe(true);
    expect(stubs.Conversation.createOrGet).toHaveBeenCalledWith(1, 2);
    expect(stubs.Message.create).toHaveBeenCalledWith(expect.objectContaining({ conversation_id: 77 }));
  });

  it('礼物消息（type=6）携带 gift_data', async () => {
    const r = await chatService.sendMessage({
      sender_id: 1, conversation_id: 50, type: 6, gift_data: { id: 3, name: '玫瑰花' },
    });
    expect(r.success).toBe(true);
    expect(stubs.Message.create).toHaveBeenCalledWith(expect.objectContaining({
      type: 6, gift_data: { id: 3, name: '玫瑰花' },
    }));
  });

  it('语音消息（type=2）携带 voice_url/duration', async () => {
    await chatService.sendMessage({
      sender_id: 1, conversation_id: 50, type: 2, voice_url: '/uploads/1.mp3', voice_duration: 15,
    });
    expect(stubs.Message.create).toHaveBeenCalledWith(expect.objectContaining({
      type: 2, voice_url: '/uploads/1.mp3', voice_duration: 15,
    }));
  });

  it('接收者离线 → 存储离线消息，delivered=false', async () => {
    stubs.websocketService.sendToUser.mockReturnValue(false);
    stubs.websocketService.isUserOnline.mockReturnValue(false);
    const r = await chatService.sendMessage({ sender_id: 1, conversation_id: 50, content: '离线消息' });
    expect(r.delivered).toBe(false);
    expect(stubs.offlineMessageService.storeMessage).toHaveBeenCalledWith(2, expect.anything());
  });

  it('文本内容为空 → 参数错误', async () => {
    const r = await chatService.sendMessage({ sender_id: 1, conversation_id: 50, content: '' });
    expect(r.success).toBe(false);
    expect(r.message).toContain('不能为空');
  });
});

describe('chat.service.recallMessage（依赖注入）', () => {
  let stubs;
  let chatService;

  beforeEach(() => {
    stubs = makeStubs();
    stubs.Message.recall.mockResolvedValue({ success: true, data: makeMessage() });
    stubs.websocketService.sendToUser.mockReturnValue(true);
    chatService = createChatService(stubs);
  });

  it('撤回成功 → 向双方推送 message_recalled', async () => {
    const r = await chatService.recallMessage(101, 1);
    expect(r.success).toBe(true);
    expect(stubs.Message.recall).toHaveBeenCalledWith(101, 1);
    // 接收者 + 发送者各推送一次
    expect(stubs.websocketService.sendToUser).toHaveBeenCalledTimes(2);
    expect(stubs.websocketService.sendToUser).toHaveBeenCalledWith(2, expect.objectContaining({ type: 'message_recalled' }));
    expect(stubs.websocketService.sendToUser).toHaveBeenCalledWith(1, expect.objectContaining({ type: 'message_recalled' }));
  });

  it('非发送者撤回 → 返回错误，不推送', async () => {
    stubs.Message.recall.mockResolvedValue({ success: false, message: '只能撤回自己的消息' });
    const r = await chatService.recallMessage(101, 3);
    expect(r.success).toBe(false);
    expect(r.message).toContain('自己的消息');
    expect(stubs.websocketService.sendToUser).not.toHaveBeenCalled();
  });

  it('消息不存在 → 返回错误，不推送', async () => {
    stubs.Message.recall.mockResolvedValue({ success: false, message: '消息不存在或已撤回' });
    const r = await chatService.recallMessage(999, 1);
    expect(r.success).toBe(false);
    expect(r.message).toContain('不存在');
    expect(stubs.websocketService.sendToUser).not.toHaveBeenCalled();
  });
});
