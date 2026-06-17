/**
 * 遇见 APP 后端 - 一键测试脚本
 * 用法: node test-api.js
 * 前提: server.js 已启动在 PORT 3001
 */

const BASE = 'http://localhost:3001';
let token = '';
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
  console.log('🧪 遇见 APP 接口测试\n');
  console.log('服务器: ' + BASE);

  // 1. 健康检查
  await test('健康检查', async () => {
    const d = await api('GET', '/health', null, false);
    if (d.code !== 0) throw new Error('状态异常');
  });

  // 2. 发送验证码
  await test('发送验证码', async () => {
    const d = await api('POST', '/api/auth/send-code', { phone: '13800138000' }, false);
    if (d.code !== 0) throw new Error(d.message);
    console.log('   验证码: 123456 (开发环境固定)');
  });

  // 3. 登录获取 token
  await test('登录/注册', async () => {
    const d = await api('POST', '/api/auth/login', { phone: '13800138000', code: '123456' }, false);
    if (!d.data?.token) throw new Error('未获取到 token');
    token = d.data.token;
    console.log('   Token: ' + token.slice(0, 30) + '...');
  });

  // 4. 获取用户信息
  await test('获取用户信息', async () => {
    const d = await api('GET', '/api/user/info');
    if (!d.data?.nickname) throw new Error('用户信息异常');
    console.log('   昵称: ' + d.data.nickname);
  });

  // 5. 更新用户信息
  await test('更新用户信息', async () => {
    const d = await api('PUT', '/api/user/info', {
      nickname: '测试用户',
      gender: 1,
      age: 25,
      location: '北京',
      tags: ['健身', '旅行', '音乐']
    });
    if (d.code !== 0) throw new Error(d.message);
  });

  // 6. 获取标签列表
  await test('获取标签列表', async () => {
    const d = await api('GET', '/api/user/tags');
    if (!Array.isArray(d.data)) throw new Error('标签数据格式错误');
    console.log('   可用标签: ' + d.data.length + ' 个');
  });

  // 7. 获取隐私设置
  await test('获取隐私设置', async () => {
    const d = await api('GET', '/api/user/settings');
    if (d.data?.allow_stranger_chat === undefined) throw new Error('设置异常');
  });

  // 8. 更新隐私设置
  await test('更新隐私设置', async () => {
    await api('PUT', '/api/user/settings', { hide_distance: 1, message_notify: 0 });
  });

  // 9. 获取推荐用户
  await test('获取推荐用户', async () => {
    const d = await api('GET', '/api/match/recommend?ageMin=18&ageMax=40&distance=50&limit=10');
    console.log('   推荐人数: ' + (d.data?.length || 0));
  });

  // 10. 获取匹配列表
  await test('获取匹配列表', async () => {
    await api('GET', '/api/match/matches');
  });

  // 11. 获取会话列表
  await test('获取会话列表', async () => {
    await api('GET', '/api/chat/conversations');
  });

  // 12. 获取未读消息数
  await test('获取未读消息数', async () => {
    await api('GET', '/api/chat/unread-count');
  });

  // 13. 发布动态
  let postId = null;
  await test('发布动态', async () => {
    const d = await api('POST', '/api/posts', {
      content: '这是一条测试动态 #旅行',
      topics: ['旅行']
    });
    postId = d.data?.id;
  });

  // 14. 获取动态列表
  await test('获取动态列表', async () => {
    await api('GET', '/api/posts');
  });

  // 15. 点赞动态
  if (postId) {
    await test('点赞动态', async () => {
      await api('POST', '/api/posts/' + postId + '/like');
    });
  }

  // 16. 礼物列表
  await test('获取礼物列表', async () => {
    const d = await api('GET', '/api/gifts/list');
    console.log('   礼物数量: ' + (d.data?.length || 0));
  });

  // 17. 钱包信息
  await test('获取钱包信息', async () => {
    await api('GET', '/api/wallet/info');
  });

  // 18. 签到
  await test('每日签到', async () => {
    const d = await api('POST', '/api/checkin');
    if (d.code === 0) console.log('   ' + d.message);
  });

  // 19. 签到状态
  await test('签到状态', async () => {
    await api('GET', '/api/checkin/status');
  });

  // 20. 每日任务
  await test('每日任务', async () => {
    const d = await api('GET', '/api/checkin/tasks');
    console.log('   任务数: ' + (d.data?.length || 0));
  });

  // 21. VIP 信息
  await test('VIP信息', async () => {
    await api('GET', '/api/user/vip-info');
  });

  // 22. 搜索用户
  await test('搜索用户', async () => {
    await api('GET', '/api/user/search?q=测试&tags=旅行');
  });

  // 23. 消费统计
  await test('消费统计', async () => {
    await api('GET', '/api/wallet/stats');
  });

  console.log('\n📊 结果: ' + pass + ' 通过, ' + fail + ' 失败');
  process.exit(fail > 0 ? 1 : 0);
})();
