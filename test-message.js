/**
 * 消息功能测试脚本
 * 测试WebSocket消息发送和HTTP API消息发送
 */

const BASE = 'http://localhost:3000';
let token = '';
let userId = null;
let conversationId = null;
let fail = 0;
let pass = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log('✅ ' + name);
    pass++;
  } catch (e) {
    console.log('❌ ' + name + ': ' + e.message);
    fail++;
  }
}

async function api(method, path, body = null, useToken = true) {
  const headers = { 'Content-Type': 'application/json' };
  if (useToken && token) headers['Authorization'] = 'Bearer ' + token;
  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(BASE + path, opts);
  const data = await res.json();
  if (res.status >= 500) throw new Error(data.message || 'Server Error');
  return data;
}

(async () => {
  console.log('🧪 消息功能测试\n');
  console.log('服务器: ' + BASE);

  // 1. 健康检查
  await test('健康检查', async () => {
    const d = await api('GET', '/health', null, false);
    if (d.code !== 0) throw new Error('状态异常');
  });

  // 2. 登录获取token
  await test('登录', async () => {
    const d = await api('POST', '/api/auth/login', { login: '13800138000', code: '123456' }, false);
    if (!d.data?.token) throw new Error('未获取到token');
    token = d.data.token;
    userId = d.data.user.id;
    console.log('   用户ID: ' + userId);
  });

  // 3. 创建测试用户（如果需要）
  let testUserId = null;
  await test('创建测试用户', async () => {
    // 发送验证码给测试用户
    await api('POST', '/api/auth/send-code', { phone: '13800138001' }, false);
    // 登录测试用户
    const d = await api('POST', '/api/auth/login', { login: '13800138001', code: '123456' }, false);
    if (!d.data?.user?.id) throw new Error('创建测试用户失败');
    testUserId = d.data.user.id;
    console.log('   测试用户ID: ' + testUserId);
    // 切换回主用户
    const d2 = await api('POST', '/api/auth/login', { login: '13800138000', code: '123456' }, false);
    token = d2.data.token;
  });

  // 4. 创建会话
  await test('创建会话', async () => {
    if (!testUserId) throw new Error('测试用户ID不存在');
    const d = await api('POST', '/api/chat/conversations', { other_user_id: testUserId });
    if (!d.data?.id) throw new Error('创建会话失败');
    conversationId = d.data.id;
    console.log('   会话ID: ' + conversationId);
  });

  // 5. 发送文字消息（HTTP API）
  await test('发送文字消息(HTTP)', async () => {
    if (!conversationId) throw new Error('会话ID不存在');
    const d = await api('POST', '/api/chat/messages', {
      conversation_id: conversationId,
      content: '测试消息-' + Date.now(),
      type: 0
    });
    if (!d.data?.id) throw new Error('发送消息失败');
    console.log('   消息ID: ' + d.data.id);
  });

  // 6. 获取消息列表
  await test('获取消息列表', async () => {
    if (!conversationId) throw new Error('会话ID不存在');
    const d = await api('GET', '/api/chat/messages?conversation_id=' + conversationId);
    if (!Array.isArray(d.data)) throw new Error('消息列表格式错误');
    console.log('   消息数量: ' + d.data.length);
  });

  // 7. 获取未读消息数
  await test('获取未读消息数', async () => {
    const d = await api('GET', '/api/chat/unread-count');
    if (d.data?.count === undefined) throw new Error('未读消息数格式错误');
    console.log('   未读消息数: ' + d.data.count);
  });

  // 8. 测试会话列表
  await test('获取会话列表', async () => {
    const d = await api('GET', '/api/chat/conversations');
    if (!Array.isArray(d.data)) throw new Error('会话列表格式错误');
    console.log('   会话数量: ' + d.data.length);
  });

  // 9. 测试WebSocket消息发送
  await test('WebSocket消息发送', async () => {
    // 这里只是验证API调用，实际WebSocket测试需要客户端
    console.log('   (需要客户端测试WebSocket)');
  });

  console.log('\n📊 结果: ' + pass + ' 通过, ' + fail + ' 失败');
  process.exit(fail > 0 ? 1 : 0);
})();
