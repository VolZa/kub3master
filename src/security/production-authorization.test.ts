import { expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { HandlerAuthorization, authorizeHandlers, wrapperPermissions } from './production-authorization';
import { verifiedIdentity, type User, type Role } from './permission-service';
import * as web from '../ui/webApp';
import * as saved from '../ui/saved-report-web';
import * as archive from '../ui/archive-management-web';
import * as bom from '../ui/bom-commit.api';
import * as forms from '../ui/openForm';
import { onOpen } from '../main';

function isolated(role: Role) {
  const identity = verifiedIdentity('https://accounts.google.com', 'isolated-handler-user', Date.now() + 60000);
  const user: User = { issuer: identity.issuer, subject: identity.subject, active: true, roles: [role], authorizationVersion: 1 };
  const auth = new HandlerAuthorization({ current: () => identity }, { find: () => user });
  const calls = vi.fn();
  const handlers = authorizeHandlers(Object.fromEntries(Object.keys(wrapperPermissions).map(name => [name, (...args: unknown[]) => { calls(name, args); return { status: 'BUSINESS_HANDLER_REACHED' }; }])), auth);
  return { auth, user, handlers, calls };
}
it('maps all 20 exact production wrapper names with no implicit permission fallback', () => {
  expect(Object.keys(wrapperPermissions).sort()).toEqual(JSON.parse(readFileSync('gas-production-entrypoints.json', 'utf8')).sort());
  const { auth } = isolated('ADMIN');
  expect(() => auth.wrapper('unknownHandler')).toThrow('ACCESS_DENIED');
  expect(() => auth.wrapper('toString')).toThrow('ACCESS_DENIED');
});
it.each(['ADMIN', 'MANAGER', 'TECHNOLOGIST'] as const)('%s reaches only explicitly permitted handlers', role => {
  const fixture = isolated(role as Role); // Legacy value is intentional adversarial input, not a valid Role.
  for (const [name, permission] of Object.entries(wrapperPermissions)) {
    const allowed = permission !== null && (role === 'ADMIN' || role === 'MANAGER' && !['BOM_EDIT', 'TECHNOLOGY_EDIT', 'USER_MANAGE'].includes(permission));
    fixture.calls.mockClear();
    if (allowed) { expect(fixture.handlers[name]({ roles: ['ADMIN'] })).toMatchObject({ status: 'BUSINESS_HANDLER_REACHED' }); expect(fixture.calls).toHaveBeenCalledTimes(1); }
    else { expect(() => fixture.handlers[name]({ roles: ['ADMIN'] })).toThrow('ACCESS_DENIED'); expect(fixture.calls).not.toHaveBeenCalled(); }
  }
});
it('unknown/unverified identity is denied before repository or handler effects', () => {
  const repository = { find: vi.fn() }, operation = vi.fn();
  const auth = new HandlerAuthorization({ current: () => undefined }, repository);
  const handlers = authorizeHandlers({ saveMaterialConsumptionReportWeb: operation }, auth);
  expect(() => handlers.saveMaterialConsumptionReportWeb({ email: 'owner@example.com', roles: ['ADMIN'] })).toThrow('ACCESS_DENIED');
  expect(repository.find).not.toHaveBeenCalled(); expect(operation).not.toHaveBeenCalled();
});
it('revoked roles and inactive users are rechecked for every direct invocation', () => {
  const s = isolated('MANAGER'); s.handlers.saveMaterialConsumptionReportWeb({});
  s.user.roles = []; expect(() => s.handlers.saveMaterialConsumptionReportWeb({})).toThrow('ACCESS_DENIED');
  s.user.roles = ['ADMIN']; s.user.active = false; expect(() => s.handlers.submitBOM({})).toThrow('ACCESS_DENIED');
  expect(s.calls).toHaveBeenCalledTimes(1);
});
it('provider/repository failure is ACCESS_DENIED with no business callback', () => {
  const operation = vi.fn(); const identity = verifiedIdentity('https://accounts.google.com', 'offline', Date.now() + 60000);
  for (const auth of [
    new HandlerAuthorization({ current() { throw new Error('provider unavailable'); } }, { find: () => undefined }),
    new HandlerAuthorization({ current: () => identity }, { find() { throw new Error('repository unavailable'); } }),
  ]) {
    expect(() => authorizeHandlers({ generateMaterialConsumptionReportWeb: operation }, auth).generateMaterialConsumptionReportWeb({})).toThrow('ACCESS_DENIED');
  }
  expect(operation).not.toHaveBeenCalled();
});
it('all exported raw production entrypoints also deny before any Google service even outside register', () => {
  const calls = [() => web.doGet(), () => web.createManufacturingFromWeb({} as any), () => web.getManufacturingHouseOptions(),
    () => web.getManufacturingProductOptions('H001'), () => web.getManufacturingPlacementOptions('H001', 'П-1'),
    () => web.generateMaterialConsumptionReportWeb({}), () => saved.getCurrentMaterialReportWeb(), () => saved.saveMaterialConsumptionReportWeb({}),
    () => archive.listSavedMaterialReportsWeb(), () => archive.renameSavedMaterialReportWeb({}), () => archive.deleteSavedMaterialReportWeb({}),
    () => bom.submitBOM({}), () => bom.resumeBOM('x'), () => bom.runTableParser('x', 'x', 'x', 'x'), () => bom.buildBOMFromText({}),
    () => forms.openForm(), () => forms.openFormTable(), () => forms.includeBOMCommitClient_(), () => onOpen()];
  // No GAS globals are installed. Reaching HtmlService/SpreadsheetApp/Session/Drive would fail differently.
  for (const call of calls) expect(call).toThrow('ACCESS_DENIED');
});
