/**
 * 遇见 APP 后端 - 一键测试脚本
 * 用法: node test-api.js
 * 前提: server.js 已启动在 PORT 3001
 */

const BASE = 'http://localhost:3000';
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
  const headers = {};
  if (useToken && token) headers['Authorization'] = 'Bearer ' + token;
  // FormData 自动设置 multipart boundary，不能手动设 Content-Type
  if (body && !(body instanceof FormData)) headers['Content-Type'] = 'application/json';
  const opts = { method, headers };
  if (body) opts.body = (body instanceof FormData) ? body : JSON.stringify(body);
  const res = await fetch(BASE + path, opts);
  const data = await res.json();
  if (res.status >= 500) throw new Error(data.message || 'Server Error');
  return data;
}

// 1x1 透明 PNG（真实 magic bytes，可通过服务端校验）
const PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
function makePngBlob() {
  const bytes = Buffer.from(PNG_BASE64, 'base64');
  return new Blob([bytes], { type: 'image/png' });
}
function pngUpload(path, field, name = 'test.png') {
  const fd = new FormData();
  fd.append(field, makePngBlob(), name);
  return api('POST', path, fd);
}

(async () => {
  console.log('🧪 遇见 APP 接口测试\n');
  console.log('服务器: ' + BASE);

  // 1. 健康检查
  await test('健康检查', async () => {
    const d = await api('GET', '/health', null, false);
    if (d.code !== 0) throw new Error('状态异常');
  });

  // 2. 发送验证码（生产 SMS_RETURN_CODE=true 时随接口返回，开发固定 123456）
  let verifyCode = '123456';
  await test('发送验证码', async () => {
    const d = await api('POST', '/api/auth/send-code', { phone: '13800138000' }, false);
    if (d.code !== 0) throw new Error(d.message);
    // 从接口响应读取实际验证码（生产环境随机生成）
    if (d.data && d.data.code) verifyCode = String(d.data.code);
    console.log('   验证码: ' + verifyCode + ' ' + (d.data && d.data.code ? '(接口返回)' : '(开发固定)'));
  });

  // 3. 登录获取 token
  await test('登录/注册', async () => {
    const d = await api('POST', '/api/auth/login', { login: '13800138000', code: verifyCode }, false);
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
      tags: ['健身', '旅行', '音乐'],
      birth_date: '1995-06-15'
    });
    if (d.code !== 0) throw new Error(d.message);
  });

  // 5.1 出生日期回读校验（修复时区倒退/ISO串乱码 BUG）
  await test('出生日期回读格式', async () => {
    const d = await api('GET', '/api/user/info');
    if (d.code !== 0) throw new Error(d.message);
    const bd = d.data?.birth_date;
    if (!bd) throw new Error('birth_date 为空');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(bd)) {
      throw new Error(`birth_date 格式异常: "${bd}"，应为 YYYY-MM-DD`);
    }
    console.log(`   出生日期: ${bd}`);
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
    const d = await api('GET', '/api/match/recommend?scope=city&ageMin=18&ageMax=40&distance=50&limit=10');
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

  // 23a. 提现接口（模拟通道）
  // 生产环境受 S2 护栏约束（NODE_ENV=production 时 SIMULATE_PAYMENT 必须为 false，真实支付未对接）：
  // 充值订单只创建不到账，故此处不依赖充值，直接验证提现接口的正确处理：
  //   - 余额充足 → 成功扣减并生成提现单
  //   - 余额不足 → 返回友好错误（不崩溃）
  await test('提现（模拟通道）', async () => {
    const d = await api('POST', '/api/wallet/withdraw', { amount: 100 });
    if (d.code !== 0) {
      if (d.message && d.message.indexOf('金币不足') > -1) {
        console.log('   余额不足（接口正确拒绝）');
      } else {
        throw new Error('提现失败: ' + (d.message || ''));
      }
    } else {
      console.log('   提现成功，余额: ' + d.data.balance);
    }
  });

  // 23b. 提现记录 + 交易明细含提现类型
  await test('提现记录', async () => {
    const wl = await api('GET', '/api/wallet/withdraws?limit=50');
    if (!Array.isArray(wl.data)) throw new Error('提现记录格式错误');
    const tx = await api('GET', '/api/wallet/transactions?limit=50');
    const hasWithdraw = (tx.data || []).some(t => t.type === 'withdraw');
    console.log('   提现记录: ' + wl.data.length + ' 条, 流水含提现: ' + hasWithdraw);
  });

  // ====== 图片功能测试（第 25+ 项） ======

  // 24. 通用图片上传 → 断言 /uploads/ 前缀 + 静态可达
  await test('通用图片上传（/uploads/ 前缀）', async () => {
    const d = await pngUpload('/api/upload/image', 'image');
    if (!d.data || !d.data.url) throw new Error('未返回 url');
    if (!d.data.url.startsWith('/uploads/')) throw new Error('URL 缺少 /uploads/ 前缀: ' + d.data.url);
    // 静态资源可达性验证
    const res = await fetch(BASE + d.data.url);
    if (res.status !== 200) throw new Error('上传图片无法访问: ' + d.data.url + ' (HTTP ' + res.status + ')');
    global.__uploadedUrl = d.data.url;
  });

  // 25. 伪图拒收（magic byte 校验）
  await test('伪图被拒（magic byte 校验）', async () => {
    const fd = new FormData();
    fd.append('image', new Blob([Buffer.from('not-an-image')], { type: 'image/png' }), 'fake.png');
    const d = await api('POST', '/api/upload/image', fd);
    if (d.code === 0) throw new Error('伪图未被拒绝');
  });

  // 26. 相册上传 / 设封面 / 删除
  let photoId = null;
  await test('相册上传', async () => {
    const d = await pngUpload('/api/user/photos', 'photo');
    if (!d.data || !d.data.id) throw new Error('相册上传失败');
    if (!d.data.url.startsWith('/uploads/')) throw new Error('相册URL缺少 /uploads/ 前缀');
    photoId = d.data.id;
  });
  if (photoId) {
    await test('相册设封面', async () => {
      await api('PUT', '/api/user/photos/' + photoId + '/cover', {});
    });
    await test('相册删除', async () => {
      await api('DELETE', '/api/user/photos/' + photoId);
    });
  }

  // 27. 多图发布动态（3张）
  let multiPostId = null;
  await test('多图发布动态（3张）', async () => {
    const fd = new FormData();
    fd.append('content', '多图测试动态');
    for (let i = 0; i < 3; i++) fd.append('images', makePngBlob(), 'img' + i + '.png');
    const d = await api('POST', '/api/posts', fd);
    if (!d.data || !d.data.id) throw new Error('多图发布失败');
    if (!d.data.images || d.data.images.length !== 3) throw new Error('图片数量不为3: ' + (d.data.images || []).length);
    for (const u of d.data.images) {
      if (!u.startsWith('/uploads/')) throw new Error('动态图片URL缺少 /uploads/ 前缀: ' + u);
    }
    multiPostId = d.data.id;
  });
  if (multiPostId) {
    await test('多图动态删除', async () => {
      await api('DELETE', '/api/posts/' + multiPostId);
    });
  }

  // ====== 社交关系测试（守护/关注/粉丝/访客） ======

  // 28. 社交关系计数
  await test('社交关系计数（守护/关注/粉丝/访客）', async () => {
    const d = await api('GET', '/api/user/social-counts');
    if (!d.data || typeof d.data.guarding !== 'number' || typeof d.data.following !== 'number') {
      throw new Error('社交计数格式错误: ' + JSON.stringify(d.data));
    }
    console.log('   守护:' + d.data.guarding + ' 关注:' + d.data.following + ' 粉丝:' + d.data.fans + ' 访客:' + d.data.viewers);
  });

  // 29. 守护 / 幂等 / 取消
  await test('守护-取消守护（幂等）', async () => {
    // 找一个可守护的目标：注册第二个用户
    const reg = await api('POST', '/api/auth/send-code', { phone: '13900139000' }, false);
    const login2 = await api('POST', '/api/auth/login', { login: '13900139000', code: reg?.data?.code || '123456' }, false);
    const uid2 = login2.data?.user?.id;
    if (!uid2) throw new Error('第二用户ID获取失败');

    const guard = await api('POST', '/api/user/guard', { target_user_id: uid2 });
    if (guard.code !== 0) throw new Error('守护失败: ' + guard.message);
    // 幂等重复守护
    const again = await api('POST', '/api/user/guard', { target_user_id: uid2 });
    if (again.code !== 0) throw new Error('幂等守护失败: ' + again.message);

    const guarding = await api('GET', '/api/user/guarding');
    if (!Array.isArray(guarding.data) || guarding.data.length < 1) throw new Error('守护列表为空');

    const unguard = await api('POST', '/api/user/unguard', { target_user_id: uid2 });
    if (unguard.code !== 0) throw new Error('取消守护失败: ' + unguard.message);
    const guardingAfter = await api('GET', '/api/user/guarding');
    if (guardingAfter.data.some(g => g.guarded_user_id === uid2)) throw new Error('取消守护后列表仍包含');
  });

  // 30. 访客列表（聚合 + 访问次数）
  await test('访客列表（聚合+访问次数+距离）', async () => {
    const d = await api('GET', '/api/user/viewers');
    if (!Array.isArray(d.data)) throw new Error('访客列表格式错误');
    // 聚合后字段完整性：如有访客，应含 user_id / visit_count / created_at
    for (const v of d.data) {
      if (!v.user_id || typeof v.visit_count !== 'number') {
        throw new Error('访客字段不完整: ' + JSON.stringify(v));
      }
      // 距离字段：访问者有坐标则应有 distance，无坐标允许 null
      if (v.distance !== undefined && v.distance !== null && typeof v.distance !== 'number') {
        throw new Error('访客距离字段异常: ' + JSON.stringify(v));
      }
    }
    console.log('   访客数: ' + d.data.length);
  });

  console.log('\n📊 结果: ' + pass + ' 通过, ' + fail + ' 失败');
  process.exit(fail > 0 ? 1 : 0);
})();
