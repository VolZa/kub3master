import { expect, it } from 'vitest';
import { PermissionService, PERMISSIONS, OPERATIONAL_PERMISSIONS, REPORT_PERMISSIONS, ROLES, verifiedIdentity,
  type Permission, type Role, type User, type SecurityEnvironment } from './permission-service';
import { PropertyUserRepository } from './property-user-repository';
import { HandlerAuthorization, wrapperPermissions, requirePermission } from './production-authorization';
import { ArchiveRolePolicy } from '../ui/archive-management-web';
function fixture(roles: readonly string[], environment: SecurityEnvironment = 'PRODUCTION') {
  const identity = verifiedIdentity('https://accounts.google.com', 'role-migration-subject', 1800000060000);
  const user: User = { issuer: identity.issuer, subject: identity.subject, active: true, roles: roles as readonly Role[], authorizationVersion: 1 };
  const users = { find: () => user };
  return { identity, user, users, permissions: new PermissionService(users, () => 1800000000000, environment) };
}
it('has exactly two roles and an explicit, unique twenty-permission vocabulary', () => {
  expect(ROLES).toEqual(['ADMIN', 'MANAGER']); expect(PERMISSIONS).toHaveLength(20);
  expect(new Set(PERMISSIONS).size).toBe(PERMISSIONS.length);
});
it.each(['PRODUCTION', 'TEST'] as const)('ADMIN has every defined permission in %s after verified identity', environment => {
  const f = fixture(['ADMIN'], environment);
  for (const permission of PERMISSIONS) expect(f.permissions.require(f.identity, permission)).toBe(f.user);
  expect(() => f.permissions.require(undefined, 'USER_MANAGE')).toThrow('ACCESS_DENIED');
  expect(() => f.permissions.require(JSON.parse(JSON.stringify(f.identity)), 'USER_MANAGE')).toThrow('ACCESS_DENIED');
  expect(() => f.permissions.require(f.identity, 'UNKNOWN_PERMISSION' as Permission)).toThrow('ACCESS_DENIED');
});
it('MANAGER receives explicit production/report/plan permissions, but no administration or technology edits', () => {
  const f = fixture(['MANAGER']);
  const expected = [
    'REPORT_GENERATE', 'REPORT_VIEW', 'REPORT_SAVE', 'REPORT_LIST', 'REPORT_RENAME', 'REPORT_DELETE',
    'MANUFACTURING_VIEW', 'MANUFACTURING_CREATE', 'MANUFACTURING_SYNC_ANALYZE', 'MANUFACTURING_SYNC_EXECUTE',
    'PLANNING_VIEW', 'PLANNING_CREATE_DRAFT', 'PLANNING_ADD_PLACEMENT', 'PLANNING_REMOVE_PLACEMENT',
    'PLANNING_APPROVE', 'PLANNING_REOPEN', 'PLANNING_SCHEDULE_PLACEMENT',
  ] as const;
  for (const permission of expected) expect(f.permissions.require(f.identity, permission)).toBe(f.user);
  expect([...REPORT_PERMISSIONS, ...OPERATIONAL_PERMISSIONS]).toEqual(expected);
  for (const permission of ['BOM_EDIT', 'TECHNOLOGY_EDIT', 'USER_MANAGE', 'UNKNOWN'] as const)
    expect(() => f.permissions.require(f.identity, permission as Permission)).toThrow('ACCESS_DENIED');
});
it('MANAGER has no TEST permissions, including reports and manufacturing', () => {
  const f = fixture(['MANAGER'], 'TEST');
  for (const permission of PERMISSIONS) expect(() => f.permissions.require(f.identity, permission)).toThrow('ACCESS_DENIED');
  const auth = new HandlerAuthorization({ current: () => f.identity }, f.users, () => 1800000000000, 'TEST');
  expect(() => auth.require('REPORT_VIEW')).toThrow('ACCESS_DENIED');
});
it.each(['ERP_OWNER', 'WORKSHOP_MANAGER', 'TECHNOLOGIST', 'DIRECTOR', 'GOOGLE_DRIVE_OWNER', 'USER_DEPLOYING'])('rejects legacy/unapproved %s alone and mixed with ADMIN', role => {
  for (const roles of [[role], ['ADMIN', role]]) {
    const f = fixture(roles);
    for (const permission of PERMISSIONS) expect(() => f.permissions.require(f.identity, permission)).toThrow('ACCESS_DENIED');
    const repo = new PropertyUserRepository({ getProperty: () => JSON.stringify({ version: 1, users: [{ ...f.user, email: 'info@example.invalid' }] }) });
    expect(() => repo.find(f.identity.issuer, f.identity.subject)).toThrow('ACCESS_DENIED');
    expect(() => new ArchiveRolePolicy(() => ({ email: 'info', roles })).authorize('delete')).toThrow('ARCHIVE_ACCESS_DENIED');
  }
});
it('unknown, inactive, revoked and expired users remain denied, even for ADMIN', () => {
  const f = fixture(['ADMIN']);
  const unknown = new PermissionService({ find: () => undefined }, () => 1800000000000);
  expect(() => unknown.require(f.identity, 'USER_MANAGE')).toThrow('ACCESS_DENIED');
  f.user.active = false; expect(() => f.permissions.require(f.identity, 'USER_MANAGE')).toThrow('ACCESS_DENIED');
  f.user.active = true; f.user.roles = [];
  expect(() => f.permissions.require(f.identity, 'USER_MANAGE')).toThrow('ACCESS_DENIED');
  f.user.roles = ['ADMIN'];
  expect(() => new PermissionService(f.users, () => 1800000060000).require(f.identity, 'USER_MANAGE')).toThrow('ACCESS_DENIED');
  expect(() => new PermissionService(f.users, () => 1800000000000, 'UNKNOWN' as SecurityEnvironment).require(f.identity, 'USER_MANAGE')).toThrow('ACCESS_DENIED');
});
it('new operational grants do not unlock held wrappers or unconfigured direct production calls', () => {
  for (const role of ROLES) {
    const f = fixture([role]), auth = new HandlerAuthorization({ current: () => f.identity }, f.users, () => 1800000000000);
    expect(() => auth.wrapper('createManufacturingFromWeb')).toThrow('ACCESS_DENIED');
    expect(() => auth.wrapper('onEdit')).toThrow('ACCESS_DENIED');
  }
  expect(wrapperPermissions.createManufacturingFromWeb).toBeNull(); expect(wrapperPermissions.onEdit).toBeNull();
  expect(wrapperPermissions.getManufacturingHouseOptions).toBe('MANUFACTURING_VIEW');
  expect(() => requirePermission('MANUFACTURING_CREATE')).toThrow('ACCESS_DENIED');
});
