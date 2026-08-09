/**
 * 管理员权限工具层
 * 权限点定义、归一化、校验（纯逻辑，可单测、可被前后端共用）
 * 权限点共 9 个：
 *   user_view / user_edit / user_ban / content_audit / report_handle
 *   data_view / push_send / verification_audit / admin_manage
 */

const ROLE_PERMISSIONS = {
  super_admin: ['*'],
  admin: ['user_view', 'user_edit', 'user_ban', 'content_audit', 'report_handle', 'data_view', 'push_send', 'admin_manage'],
  operator: ['data_view', 'content_audit', 'push_send'],
  auditor: ['content_audit', 'verification_audit', 'report_handle'],
  cs: ['user_view', 'report_handle']
};

// 所有合法权限点（供 normalize 过滤非法项）
const ALL_PERMISSION_KEYS = ['user_view', 'user_edit', 'user_ban', 'content_audit', 'report_handle', 'data_view', 'push_send', 'verification_audit', 'admin_manage'];

/**
 * 权限中文目录（供前端勾选渲染）
 * @returns {Array<{key:string,label:string,group:string}>}
 */
function getPermissionCatalog() {
  return [
    { key: 'user_view', label: '查看用户', group: '用户管理' },
    { key: 'user_edit', label: '修改用户资料/重置密码/备注', group: '用户管理' },
    { key: 'user_ban', label: '封禁/解封用户', group: '用户管理' },
    { key: 'content_audit', label: '内容审核/敏感词/动态管理', group: '内容管理' },
    { key: 'report_handle', label: '处理举报', group: '内容管理' },
    { key: 'verification_audit', label: '认证审核', group: '内容管理' },
    { key: 'data_view', label: '查看数据/订单/礼物/流水', group: '数据运营' },
    { key: 'push_send', label: '发送推送', group: '数据运营' },
    { key: 'admin_manage', label: '管理员/公告/系统配置', group: '系统管理' }
  ];
}

/**
 * 归一化权限数组
 * - '*' → ['*']（超级权限）
 * - 非数组 / 空 → 回退到该角色的默认权限
 * - 去重、过滤非法权限点（'*' 除外）
 * @param {*} perms - 原始权限（数组 / '*' / null / 字符串JSON等）
 * @param {string} role - 管理员角色
 * @returns {string[]}
 */
function normalizePermissions(perms, role) {
  if (perms === '*' || perms === ['*']) return ['*'];
  if (Array.isArray(perms)) {
    if (perms.length === 0) {
      return ROLE_PERMISSIONS[role] ? ROLE_PERMISSIONS[role].slice() : [];
    }
    // 去重 + 过滤非法项（'*' 视为合法通配）
    const result = [];
    for (const p of perms) {
      if (p === '*' || ALL_PERMISSION_KEYS.includes(p)) {
        if (!result.includes(p)) result.push(p);
      }
    }
    return result;
  }
  // 字符串（如 'user_view,user_ban'）或非法类型 → 拆分后走数组逻辑
  if (typeof perms === 'string') {
    const arr = perms.split(',').map(s => s.trim()).filter(Boolean);
    const parsed = normalizePermissions(arr, role);
    // 拆分后全部为非法项（如 'not-an-array'）→ 回退角色默认，避免误判为空权限
    if (parsed.length === 0 && arr.length > 0 && role && ROLE_PERMISSIONS[role]) {
      return ROLE_PERMISSIONS[role].slice();
    }
    return parsed;
  }
  return ROLE_PERMISSIONS[role] ? ROLE_PERMISSIONS[role].slice() : [];
}

/**
 * 校验管理员是否拥有某权限
 * @param {{admin_role?:string, permissions?:string[]}|null} admin - req.admin（adminAuth 注入）
 * @param {string} perm - 权限点
 * @returns {boolean}
 */
function hasPermission(admin, perm) {
  if (!admin) return false;
  if (admin.admin_role === 'super_admin') return true;
  const perms = admin.permissions;
  if (!Array.isArray(perms)) return false;
  return perms.includes('*') || perms.includes(perm);
}

module.exports = {
  ROLE_PERMISSIONS,
  ALL_PERMISSION_KEYS,
  normalizePermissions,
  hasPermission,
  getPermissionCatalog
};
