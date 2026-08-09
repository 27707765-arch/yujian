/**
 * 管理员权限工具层单元测试（纯函数）
 * 直接测试 src/utils/permissions.js：
 * - normalizePermissions：'*' 直通 / 空与非法回退 / 去重过滤
 * - hasPermission：super_admin 恒 true / '*' 通配 / 精确匹配 / 缺权限 false
 * - ROLE_PERMISSIONS 完整性 + permission_catalog 覆盖
 * 无 DB 依赖（符合项目纯逻辑测试文化）。
 */
import { describe, it, expect } from 'vitest';
import {
  ROLE_PERMISSIONS,
  ALL_PERMISSION_KEYS,
  normalizePermissions,
  hasPermission,
  getPermissionCatalog
} from '../src/utils/permissions.js';

describe('normalizePermissions', () => {
  it('"*" 直通为通配权限', () => {
    expect(normalizePermissions('*', 'admin')).toEqual(['*']);
    expect(normalizePermissions(['*'], 'admin')).toEqual(['*']);
  });

  it('空数组回退到角色默认权限', () => {
    const fallback = ROLE_PERMISSIONS.operator.slice();
    expect(normalizePermissions([], 'operator')).toEqual(fallback);
    expect(fallback.length).toBeGreaterThan(0);
  });

  it('非数组 / null / undefined 回退到角色默认权限', () => {
    expect(normalizePermissions(null, 'admin')).toEqual(ROLE_PERMISSIONS.admin.slice());
    expect(normalizePermissions(undefined, 'cs')).toEqual(ROLE_PERMISSIONS.cs.slice());
    expect(normalizePermissions('not-an-array', 'auditor')).toEqual(ROLE_PERMISSIONS.auditor.slice());
  });

  it('去重 + 过滤非法权限点', () => {
    const result = normalizePermissions(['user_view', 'user_view', 'hack_perm', 'user_ban'], 'admin');
    expect(result).toEqual(['user_view', 'user_ban']);
  });

  it("'*' 与具体项混合时保留通配", () => {
    const result = normalizePermissions(['user_view', '*'], 'admin');
    expect(result).toEqual(['user_view', '*']);
  });

  it('未知角色空数组返回空', () => {
    expect(normalizePermissions([], 'unknown_role')).toEqual([]);
  });
});

describe('hasPermission', () => {
  it('super_admin 任意权限恒 true', () => {
    expect(hasPermission({ admin_role: 'super_admin' }, 'anything')).toBe(true);
  });

  it("permissions 含 '*' 通配时 true", () => {
    expect(hasPermission({ admin_role: 'operator', permissions: ['*'] }, 'user_ban')).toBe(true);
  });

  it('精确匹配返回 true', () => {
    expect(hasPermission({ admin_role: 'operator', permissions: ['data_view'] }, 'data_view')).toBe(true);
  });

  it('缺权限返回 false', () => {
    expect(hasPermission({ admin_role: 'operator', permissions: ['data_view'] }, 'user_ban')).toBe(false);
    expect(hasPermission({ admin_role: 'operator', permissions: [] }, 'data_view')).toBe(false);
  });

  it('admin 为 null / 无 permissions 时 false', () => {
    expect(hasPermission(null, 'data_view')).toBe(false);
    expect(hasPermission({ admin_role: 'admin' }, 'data_view')).toBe(false);
  });
});

describe('ROLE_PERMISSIONS 完整性', () => {
  it('所有角色权限数组非空', () => {
    for (const role of Object.keys(ROLE_PERMISSIONS)) {
      expect(ROLE_PERMISSIONS[role].length, `角色 ${role} 权限为空`).toBeGreaterThan(0);
    }
  });

  it('admin 角色包含 admin_manage 权限', () => {
    expect(ROLE_PERMISSIONS.admin).toContain('admin_manage');
  });

  it('super_admin 只有通配权限', () => {
    expect(ROLE_PERMISSIONS.super_admin).toEqual(['*']);
  });

  it('permission_catalog 的 key 覆盖全部权限点', () => {
    const catalogKeys = getPermissionCatalog().map(c => c.key);
    // 每个非通配权限点都在目录中有中文说明
    for (const key of ALL_PERMISSION_KEYS) {
      expect(catalogKeys, `权限点 ${key} 缺少目录说明`).toContain(key);
    }
  });

  it('permission_catalog 数量与权限点一致', () => {
    expect(getPermissionCatalog().length).toBe(ALL_PERMISSION_KEYS.length);
  });
});
