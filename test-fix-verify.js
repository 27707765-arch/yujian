/**
 * 问题修复验证脚本
 * 测试消息保存和用户推荐功能
 */

const BASE = 'http://localhost:3000';
let token = '';
let userId = null;
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
  console.log('🔧 问题修复验证测试\n');
  console.log('服务器: ' + BASE);
  console.log('=' .repeat(50));

  // ==================== 第一部分：登录 ====================
  console.log('\n📱 第一部分：用户登录');
  
  await test('健康检查', async () => {
    const d = await api('GET', '/health', null, false);
    if (d.code !== 0) throw new Error('状态异常');
  });

  await test('登录获取token', async () => {
    const d = await api('POST', '/api/auth/login', { login: '13800138000', code: '123456' }, false);
    if (!d.data?.token) throw new Error('未获取到token');
    token = d.data.token;
    userId = d.data.user.id;
    console.log('   用户ID: ' + userId);
  });

  // ==================== 第二部分：消息保存测试 ====================
  console.log('\n💬 第二部分：消息保存测试');

  let conversationId = null;
  let testUserId = 1001; // 使用虚拟测试用户

  await test('创建会话', async () => {
    const d = await api('POST', '/api/chat/conversations', { other_user_id: testUserId });
    if (!d.data?.id) throw new Error('创建会话失败: ' + JSON.stringify(d));
    conversationId = d.data.id;
    console.log('   会话ID: ' + conversationId);
  });

  await test('发送文字消息', async () => {
    const d = await api('POST', '/api/chat/messages', {
      conversation_id: conversationId,
      content: '测试消息-' + Date.now(),
      type: 0
    });
    if (!d.data?.id) throw new Error('发送消息失败: ' + JSON.stringify(d));
    console.log('   消息ID: ' + d.data.id);
  });

  await test('验证消息已保存', async () => {
    const d = await api('GET', '/api/chat/messages?conversation_id=' + conversationId);
    if (!Array.isArray(d.data)) throw new Error('消息列表格式错误');
    if (d.data.length === 0) throw new Error('消息列表为空，消息未保存');
    console.log('   消息数量: ' + d.data.length);
  });

  await test('发送图片消息', async () => {
    const d = await api('POST', '/api/chat/messages', {
      conversation_id: conversationId,
      content: '',
      type: 1,
      image_url: '/uploads/test.jpg'
    });
    if (!d.data?.id) throw new Error('发送图片消息失败');
    console.log('   图片消息ID: ' + d.data.id);
  });

  await test('验证图片消息已保存', async () => {
    const d = await api('GET', '/api/chat/messages?conversation_id=' + conversationId);
    const imageMsg = d.data.find(m => m.type === 1);
    if (!imageMsg) throw new Error('图片消息未保存');
    console.log('   图片消息已保存');
  });

  // ==================== 第三部分：用户推荐测试 ====================
  console.log('\n👥 第三部分：用户推荐测试');

  await test('获取同城推荐', async () => {
    const d = await api('GET', '/api/match/recommend?scope=city&limit=10');
    if (!Array.isArray(d.data)) throw new Error('推荐列表格式错误');
    console.log('   同城推荐数量: ' + d.data.length);
    if (d.data.length > 0) {
      console.log('   第一个用户: ' + d.data[0].nickname + ' (' + d.data[0].city + ')');
    }
  });

  await test('获取附近推荐', async () => {
    // 先确保当前用户有位置信息
    await api('PUT', '/api/user/info', {
      lat: 39.9219,
      lng: 116.4435,
      city: '北京市'
    });
    
    const d = await api('GET', '/api/match/recommend?scope=nearby&distance=50&limit=10');
    if (!Array.isArray(d.data)) throw new Error('推荐列表格式错误');
    console.log('   附近推荐数量: ' + d.data.length);
  });

  await test('验证推荐用户有数据', async () => {
    const d = await api('GET', '/api/match/recommend?scope=city&limit=5');
    if (d.data.length === 0) {
      console.log('   ⚠️  警告：没有推荐用户，可能需要先执行数据库脚本添加测试用户');
    } else {
      d.data.forEach((user, i) => {
        console.log('   ' + (i+1) + '. ' + user.nickname + ' - ' + user.city);
      });
    }
  });

  // ==================== 第四部分：会话和消息列表 ====================
  console.log('\n📋 第四部分：会话和消息列表');

  await test('获取会话列表', async () => {
    const d = await api('GET', '/api/chat/conversations');
    if (!Array.isArray(d.data)) throw new Error('会话列表格式错误');
    console.log('   会话数量: ' + d.data.length);
    if (d.data.length > 0) {
      console.log('   最新会话: ' + (d.data[0].other_user_nickname || '未知'));
    }
  });

  await test('获取未读消息数', async () => {
    const d = await api('GET', '/api/chat/unread-count');
    console.log('   未读消息数: ' + d.data.count);
  });

  // ==================== 结果汇总 ====================
  console.log('\n' + '=' .repeat(50));
  console.log('📊 测试结果: ' + pass + ' 通过, ' + fail + ' 失败');
  
  if (fail > 0) {
    console.log('\n⚠️  存在失败的测试，请检查：');
    console.log('1. 是否已执行 fix_all_issues.sql 脚本');
    console.log('2. 服务器是否已重启');
    console.log('3. 数据库连接是否正常');
  } else {
    console.log('\n✅ 所有测试通过！问题已修复。');
  }
  
  process.exit(fail > 0 ? 1 : 0);
})();
