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
it('built GAS exposes only explicit wrappers; internal BOM scopes, receipts and legacy writers are private', async () => {
  const { default: config } = await import(pathToFileURL(resolve('rollup.config.mjs')).href);
  const bundle = await rollup(config);
  let code: string;
  try { const generated = await bundle.generate(config.output); code = generated.output.find(chunk => chunk.type === 'chunk')!.code; }
  finally { await bundle.close(); }
  const parsed = ts.createSourceFile('Code.gs', code, ts.ScriptTarget.Latest, true);
  const publicNames = parsed.statements.filter(ts.isFunctionDeclaration).map(node => node.name!.text);
  for (const name of ['submitBOM', 'resumeBOM', 'runTableParser', 'buildBOMFromText', 'onOpen', 'onEdit', 'openForm', 'openFormTable', 'createManufacturingFromWeb', 'getManufacturingHouseOptions', 'getManufacturingProductOptions', 'getManufacturingPlacementOptions', 'rebuildManufacturingState']) expect(publicNames).toContain(name);
  const internal = ['commitBOM', 'resumeBOMCommit', 'writeSafeBOM', 'writeSafeBOMUnderLock', 'recoverSafeBOM', 'generateIdByType', 'mapPreparedBOMToPhysicalPlan', 'buildBOMFromTable', 'buildBOMRow', 'replaceBOMForParent', 'insertBOMRows', 'deleteBOMByParentId', 'deleteBOMTree', 'withLegacyBOMCompatibilityForTests', 'register'];
  internal.forEach(name => expect(publicNames).not.toContain(name));
  const effects: unknown[] = [];
  const context: Record<string, any> = { console, Session: { getActiveUser: () => ({ getEmail: () => 'owner@example.com' }) },
    DriveApp: { getFileById: (id: string) => { expect(id).toBe(SpreadsheetConfig.MASTER.id); return { getOwner: () => ({ getEmail: () => 'owner@example.com' }), getEditors: () => [] }; } },
    SpreadsheetApp: { openById: () => { effects.push('open'); throw new Error('No writes allowed'); } },
  };
  runInNewContext(code, context);
  internal.forEach(name => expect(context[name]).toBeUndefined());
  for (const name of publicNames) expect(context[name]).toBeTypeOf('function');
  const response = context.submitBOM({ operationID: 'BOM_test', projectDocumentID: '9', parentInput: 'P', specification: 'text', createdParts: [] });
  expect(response.status).toBe('VALIDATION_ERROR'); expect(effects).toEqual([]);
}, 20000);
