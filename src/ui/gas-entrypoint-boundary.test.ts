/**
 * Path: C:/www/26/03/kub3master-ts/src/ui/gas-entrypoint-boundary.test.ts
 * Module: GAS UI boundary
 * Layer: Build tests
 * Responsibility: verify the actual built global RPC surface excludes internal mutation APIs.
 */
import { expect, it } from 'vitest';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { rollup } from 'rollup';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { SpreadsheetConfig } from '../infrastructure/spreadsheets/SpreadsheetConfig';
import { readFileSync } from 'node:fs';
it('built GAS exposes only explicit wrappers; internal BOM scopes, receipts and legacy writers are private', async () => {
  const { default: config } = await import(pathToFileURL(resolve('rollup.config.mjs')).href);
  const bundle = await rollup(config);
  let code: string;
  try { const generated = await bundle.generate(config.output); code = generated.output.find(chunk => chunk.type === 'chunk')!.code; }
  finally { await bundle.close(); }
  const parsed = ts.createSourceFile('Code.gs', code, ts.ScriptTarget.Latest, true);
  const publicNames = parsed.statements.filter(ts.isFunctionDeclaration).map(node => node.name!.text);
  expect([...publicNames].sort()).toEqual(JSON.parse(readFileSync('gas-production-entrypoints.json', 'utf8')).sort());
  for (const name of publicNames) expect(name).not.toMatch(/^(test|debug|KUB_B2_|manufacturingInitialMigration|rebuildManufacturingState|createManufacturingFromBuffer)/);
  const internal = ['commitBOM', 'resumeBOMCommit', 'writeSafeBOM', 'writeSafeBOMUnderLock', 'recoverSafeBOM', 'generateIdByType', 'mapPreparedBOMToPhysicalPlan', 'buildBOMFromTable', 'buildBOMRow', 'replaceBOMForParent', 'insertBOMRows', 'deleteBOMByParentId', 'deleteBOMTree', 'withLegacyBOMCompatibilityForTests', 'register', 'manufacturingInitialMigration', 'testManufacturingRepositorySave', 'testGenerateProjectMaterialMatrixReport', 'KUB_B2_firstControlledReportWrite', 'KUB_B2_readOnlyPreflight', 'rebuildManufacturingState', 'createManufacturingFromBuffer'];
  internal.forEach(name => expect(publicNames).not.toContain(name));
  const effects: unknown[] = [];
  const context: Record<string, any> = { console, Session: { getActiveUser: () => ({ getEmail: () => 'owner@example.com' }) },
    DriveApp: { getFileById: (id: string) => { expect(id).toBe(SpreadsheetConfig.MASTER.id); return { getOwner: () => ({ getEmail: () => 'owner@example.com' }), getEditors: () => [] }; } },
    SpreadsheetApp: { openById: () => { effects.push('open'); throw new Error('No writes allowed'); } },
  };
  runInNewContext(code, context);
  internal.forEach(name => expect(context[name]).toBeUndefined());
  for (const name of internal) expect(context.__kubGasHandlers_[name]).toBeUndefined();
  for (const name of publicNames) expect(context[name]).toBeTypeOf('function');
  for (const name of publicNames) {
    expect(() => context[name]({ credential: 'forged', email: 'owner@example.com', roles: ['ADMIN'], range: {} })).toThrow('ACCESS_DENIED');
    expect(() => context.__kubGasHandlers_[name]({ roles: ['ADMIN'] })).toThrow('ACCESS_DENIED');
  }
  for (const name of ['verifiedIdentity', 'HandlerAuthorization', 'authorizeHandlers', 'requirePermission', 'IdentityPrototype', 'SessionPrototype', 'PropertyUserRepository', 'LoginBridgePrototype', 'bridgeReadyMessage', 'BrokerAssertionPrototype']) expect(context[name]).toBeUndefined();
  expect(code).not.toContain('google-account-A');
  expect(code).not.toContain('offline-client');
  expect(code).not.toContain('node:crypto');
  expect(code).not.toContain('session-offline-A');
  expect(code).not.toContain('bridge-offline-owner');
  expect(code).not.toContain('KUB_BRIDGE_READY');
  expect(code).not.toContain('isolated-assertion-account');
  expect(code).not.toContain('google-auth-library');
  for (const name of ['TestReset', 'createGasTestReset', 'TEST_RESET', 'testReset']) {
    expect(context[name]).toBeUndefined(); expect(context.__kubGasHandlers_[name]).toBeUndefined();
  }
  expect(code).not.toContain('KUB_TEST_ENV_V1');
  expect(code).not.toContain('KUB_TEST_INSTALLATION_V1');
  expect(code).not.toContain('KUB_SECURITY_USERS_V1'); // Unconfigured prototype adapters stay outside production graph.
  expect(effects).toEqual([]);
}, 20000);
