// 优化匹配服务 - 添加智能降级逻辑
// 当同城/附近没有足够用户时，自动扩大搜索范围

// 在 match.service.js 的 recommendUsers 函数中，替换原有的查询逻辑

async function recommendUsers(user_id, filters = {}) {
  try {
    const currentUser = await User.findById(user_id);
    if (!currentUser) {
      throw new Error('用户不存在');
    }

    const { scope = 'city', ageMin = 18, ageMax = 35, distance = 20, limit = 20 } = filters;

    // 根据查询模式获取候选用户
    let users = [];
    let actualScope = scope;
    
    if (scope === 'nearby' && currentUser.lat && currentUser.lng) {
      // 附近：按距离查
      users = await User.getNearbyUsers(
        user_id, currentUser.lat, currentUser.lng, distance, limit * 3
      );
      
      // 智能降级：如果附近用户不足，扩大距离范围
      if (users.length < 5) {
        const expandedUsers = await User.getNearbyUsers(
          user_id, currentUser.lat, currentUser.lng, distance * 3, limit * 3
        );
        if (expandedUsers.length > users.length) {
          users = expandedUsers;
          actualScope = 'nearby_expanded';
        }
      }
    } 
    
    if (scope === 'city' || (scope === 'nearby' && users.length < 5)) {
      // 同城查询
      const cityUsers = currentUser.city 
        ? await User.getUsersByCity(user_id, currentUser.city, limit * 3)
        : [];
      
      // 如果同城用户不足，合并结果
      if (users.length < 5 && cityUsers.length > 0) {
        const existingIds = new Set(users.map(u => u.id));
        const newUsers = cityUsers.filter(u => !existingIds.has(u.id));
        users = [...users, ...newUsers];
        actualScope = 'city_merged';
      } else if (users.length === 0) {
        users = cityUsers;
        actualScope = 'city';
      }
    }
    
    // 最终降级：如果仍然没有用户，查询所有用户
    if (users.length < 3) {
      try {
        const result = await executeQuery(
          'SELECT id, nickname, avatar, gender, age, height, occupation, location, bio, tags, is_vip, lat, lng FROM users WHERE id != ? AND status = 1 LIMIT ?',
          [user_id, limit * 3]
        );
        const allUsers = Array.isArray(result) ? result : (result && result[0]) || [];
        
        // 合并去重
        const existingIds = new Set(users.map(u => u.id));
        const newUsers = allUsers.filter(u => !existingIds.has(u.id));
        users = [...users, ...newUsers];
        
        if (users.length > 0 && actualScope === scope) {
          actualScope = 'all';
        }
      } catch (fallbackErr) {
        // 忽略错误
      }
    }

    // 年龄过滤
    const ageFiltered = users.filter(user => {
      if (user.age && (user.age < ageMin || user.age > ageMax)) {
        return false;
      }
      return true;
    });

    // ... 后续过滤逻辑保持不变 ...
    
    // 在返回结果中添加实际使用的scope，方便前端显示
    const result = await filterAndRankUsers(user_id, ageFiltered, limit);
    result._actualScope = actualScope;
    
    return result;
  } catch (err) {
    console.error('推荐用户失败:', err);
    throw err;
  }
}
