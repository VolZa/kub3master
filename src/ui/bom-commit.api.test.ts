/**
 * Path: C:/www/26/03/kub3master-ts/src/ui/bom-commit.api.test.ts
 * Module: BOM UI
 * Layer: Tests
 * Responsibility: verify trusted authorization, strict payloads, old adapters and legacy quarantine with GAS mocks.
 */
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { submitBOM, resumeBOM, runTableParser, buildBOMFromText } from './bom-commit.api';
import { commitBOM, resumeBOMCommit } from '../modules/bom/commit/safe-commit.service';
import { insertBOMRows, replaceBOMForParent, deleteBOMTree, deleteBOMByParentId } from '../modules/bom/bom.repository';
import { buildBOMFromTable } from '../modules/bom/bom.service';
import { SpreadsheetConfig } from '../infrastructure/spreadsheets/SpreadsheetConfig';
import { withLegacyBOMCompatibilityForTests } from '../modules/bom/legacy-save-quarantine';
import { HandlerAuthorization, requirePermission } from '../security/production-authorization';
import { verifiedIdentity } from '../security/permission-service';
vi.mock('../security/production-authorization', async importOriginal => ({ ...await importOriginal<typeof import('../security/production-authorization')>(), requirePermission: vi.fn() }));
vi.mock('../modules/bom/commit/safe-commit.service', () => ({ commitBOM: vi.fn(), resumeBOMCommit: vi.fn() }));
const request = { operationID: 'BOM_test', projectDocumentID: '9', parentInput: 'Плита; П-1; опис', specification: 'Стержень; ГСк-1; 3\nАрматура; R_12_A500C_L400; 4' };
let email: string;
const forbidden = vi.fn(), file = vi.fn();
beforeEach(() => {
  vi.clearAllMocks(); email = 'editor@example.com';
  const identity = verifiedIdentity('https://accounts.google.com', 'isolated-bom-user', Date.now() + 60000);
  const auth = new HandlerAuthorization({ current: () => email ? identity : undefined }, { find: () => ['owner@example.com', 'editor@example.com'].includes(email)
    ? { issuer: identity.issuer, subject: identity.subject, active: true, roles: ['ERP_OWNER'], authorizationVersion: 1 } : undefined });
  vi.mocked(requirePermission).mockImplementation(permission => { auth.require(permission); });
  vi.stubGlobal('Session', { getActiveUser: () => ({ getEmail: () => email }) });
  file.mockImplementation(id => { expect(id).toBe(SpreadsheetConfig.MASTER.id); return { getOwner: () => ({ getEmail: () => 'owner@example.com' }), getEditors: () => [{ getEmail: () => 'editor@example.com' }] }; });
  vi.stubGlobal('DriveApp', { getFileById: file });
  vi.stubGlobal('SpreadsheetApp', { getActive: forbidden, getActiveSpreadsheet: forbidden, openById: forbidden });
  vi.mocked(commitBOM).mockImplementation((_input, id) => ({ status: 'COMMITTED', operationID: id }));
  vi.mocked(resumeBOMCommit).mockImplementation(id => ({ status: 'ALREADY_APPLIED', operationID: id }));
});
afterEach(() => { expect(forbidden).not.toHaveBeenCalled(); vi.unstubAllGlobals(); });
it('maps raw input with exact document, parent description and structured text to one service', () => {
  expect(submitBOM(request).status).toBe('COMMITTED');
  expect(commitBOM).toHaveBeenCalledWith({ projectDocumentID: '9', parentInput: request.parentInput, specification: request.specification }, 'BOM_test');
});
it.each(['COMMITTED', 'ALREADY_APPLIED', 'VALIDATION_ERROR', 'RECOVERY_REQUIRED', 'CONFLICT'] as const)('preserves service status %s and row diagnostics', status => {
  vi.mocked(commitBOM).mockReturnValue({ status, operationID: 'BOM_test', diagnostics: [{ sourceRowIndex: 2, code: 'COMPONENT_INVALID', message: 'Missing Part' }] });
  expect(submitBOM(request)).toMatchObject({ status, diagnostics: [{ sourceRowIndex: 2 }] });
});
it('routes both old server adapters through trusted commit with explicit ProjectDocumentID and OperationID', () => {
  expect(runTableParser('9', request.parentInput, request.specification, 'BOM_test').status).toBe('COMMITTED');
  expect(buildBOMFromText({ projectDocumentID: '9', parentCode: request.parentInput, specification: request.specification, operationID: 'BOM_test' }).status).toBe('COMMITTED');
  expect(commitBOM).toHaveBeenCalledTimes(2);
});
it('rejects old payloads lacking document/OperationID instead of creating new context', () => {
  expect(buildBOMFromText({ parentCode: 'КП-1', specification: 'text' }).status).toBe('VALIDATION_ERROR');
  expect(runTableParser('9', request.parentInput, request.specification, undefined).status).toBe('VALIDATION_ERROR');
  expect(commitBOM).not.toHaveBeenCalled();
});
it('resume is authorized independently of knowledge of the operation ID', () => {
  expect(resumeBOM('BOM_test').status).toBe('ALREADY_APPLIED'); expect(resumeBOMCommit).toHaveBeenCalledWith('BOM_test');
  email = 'viewer@example.com'; expect(() => resumeBOM('BOM_test')).toThrow('ACCESS_DENIED'); expect(resumeBOMCommit).toHaveBeenCalledTimes(1);
});
it.each(['', 'viewer@example.com'])('rejects unidentified/unauthorized %s before all service calls', value => {
  email = value; expect(() => submitBOM(request)).toThrow('ACCESS_DENIED'); expect(() => buildBOMFromText(request)).toThrow('ACCESS_DENIED'); expect(commitBOM).not.toHaveBeenCalled();
});
it('allows explicit ERP_OWNER from isolated identity/repository, not Drive ownership', () => {
  email = 'owner@example.com'; expect(submitBOM(request).status).toBe('COMMITTED');
});
it.each(['PreparedBOM', 'SafeBOMPlan', 'bindings', 'createdParts', 'AffectedParentIDs', 'commentChanges', 'rows'])('rejects client-controlled internal %s', key => {
  expect(submitBOM({ ...request, [key]: [] }).status).toBe('VALIDATION_ERROR'); expect(commitBOM).not.toHaveBeenCalled();
});
it.each([{ projectDocumentID: '' }, { projectDocumentID: 9 }, { operationID: 'test_BOM' }, { operationID: '' }, { parentInput: '' }, { specification: '' }])('rejects invalid payload %j', changed => {
  expect(submitBOM({ ...request, ...changed }).status).toBe('VALIDATION_ERROR'); expect(commitBOM).not.toHaveBeenCalled();
});
it.each(['insert', 'replace', 'delete parent', 'delete tree', 'build table'])('quarantines destructive legacy %s before any Sheet or Element action', kind => {
  const call = () => kind === 'insert' ? insertBOMRows([]) : kind === 'replace' ? replaceBOMForParent('4000000', []) : kind === 'delete parent' ? deleteBOMByParentId('4000000') : kind === 'delete tree' ? deleteBOMTree('4000000') : buildBOMFromTable({} as never, [], {} as never, {} as never, {} as never, {} as never, {} as never);
  expect(call).toThrow('LEGACY_BOM_SAVE_DISABLED');
});
it('compatibility guard always resets after a failing local test action', () => {
  expect(() => withLegacyBOMCompatibilityForTests(() => { throw new Error('test failure'); })).toThrow('test failure');
  expect(() => insertBOMRows([])).toThrow('LEGACY_BOM_SAVE_DISABLED');
});
