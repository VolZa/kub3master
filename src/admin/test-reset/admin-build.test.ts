import { expect, it } from 'vitest';
import { rollup } from 'rollup';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { createHash } from 'node:crypto';
import { TEST_INSTALLATION_KEY, TEST_CONFIG_KEY } from './test-configuration';
import { TEST_USERS_KEY } from './admin-preflight';
import { TEST_RESET_SOURCES, PRODUCTION_SCRIPT_ID } from './test-sources';

it('actual TEST-admin bundle exposes only private admin workflow; diagnostics/review stay read-only', async () => {
  const { default: config } = await import(pathToFileURL(resolve('rollup.test-admin.config.mjs')).href);
  const bundle = await rollup(config);
  let output;
  try { output = await bundle.generate(config.output); } finally { await bundle.close(); }
  const chunk = output.output.find(o => o.type === 'chunk');
  const asset = output.output.find(o => o.type === 'asset' && o.fileName === 'appsscript.json');
  if (!chunk || chunk.type !== 'chunk' || !asset || asset.type !== 'asset') throw Error('Missing build output');
  const code = chunk.code;
  const manifest = JSON.parse(asset.source as string);
  expect(manifest.webapp).toBeUndefined(); expect(manifest.executionApi).toBeUndefined(); expect(manifest.dependencies).toEqual({});
  expect(manifest.oauthScopes).toContain('https://www.googleapis.com/auth/drive');
  expect(manifest.oauthScopes).toContain('https://www.googleapis.com/auth/spreadsheets.readonly');
  expect(manifest.oauthScopes).not.toContain('https://www.googleapis.com/auth/spreadsheets');
  const ast = ts.createSourceFile('Code.gs', code, ts.ScriptTarget.Latest, true);
  const functions = ast.statements.filter(ts.isFunctionDeclaration).map(n => n.name!.text);
  expect(functions.sort()).toEqual(['KUB_TEST_adminIdentity_', 'KUB_TEST_readOnlyPreflight_', 'KUB_TEST_prepare_', 'KUB_TEST_reviewPending_', 'KUB_TEST_recoverPending_', 'KUB_TEST_recordPendingReview_', 'KUB_TEST_registerReviewEvidence_', 'KUB_TEST_activate_', 'KUB_TEST_rollback_'].sort());
  expect(functions.every(n => n.endsWith('_'))).toBe(true);
  for (const term of ['setValues', 'createTrigger', 'setTrashed', 'verified@example.invalid', 'confirmed-google-subject', 'ADMIN allowed by default', 'class TestReset']) expect(code).not.toContain(term);
  const sourceCalls: string[] = [], logs: string[] = [], mutation = () => { throw Error('Mutation attempted'); };
  let scriptId = 'isolated-build-test-script';
  const props = new Map<string, string>([
    [TEST_INSTALLATION_KEY, JSON.stringify({ version: 1, environment: 'TEST', scriptId })],
    [TEST_USERS_KEY, JSON.stringify({ version: 1, users: [{ issuer: 'https://accounts.google.com', subject: 'vm-enrolled-account', email: 'vm@example.invalid', active: true, roles: ['ADMIN'], authorizationVersion: 1 }] })],
  ]);
  const initial = JSON.stringify([...props]); let tokenCalls = 0;
  const context: Record<string, any> = {
    Utilities: { DigestAlgorithm: { SHA_256: 'sha' }, Charset: { UTF_8: 'utf8' }, computeDigest: (_a: string, s: string) => [...createHash('sha256').update(s).digest()], newBlob: (s: string) => ({ getBytes: () => Buffer.from(s) }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
    console: { log: (s: string) => logs.push(s) },
    ScriptApp: { getScriptId: () => scriptId, getService: () => ({ getUrl: () => null }), getOAuthToken: () => { tokenCalls++; return 'vm-private-oauth-token'; }, newTrigger: mutation },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k: string) => props.get(k) ?? null, setProperty: mutation }) },
    UrlFetchApp: { fetch: (url: string, options: any) => {
      expect(url).toBe('https://openidconnect.googleapis.com/v1/userinfo'); expect(options.followRedirects).toBe(false);
      expect(options.headers.Authorization).toBe('Bearer vm-private-oauth-token');
      return { getResponseCode: () => 200, getHeaders: () => ({ 'Content-Type': 'application/json' }),
        getContentText: () => JSON.stringify({ sub: 'vm-enrolled-account', email: 'vm@example.invalid', email_verified: true }) };
    } },
    DriveApp: { getFileById: (id: string) => { sourceCalls.push(id); return { getId: () => id, isTrashed: () => false,
      getMimeType: () => 'application/vnd.google-apps.spreadsheet', makeCopy: mutation }; }, createFolder: mutation },
    SpreadsheetApp: { openById: (id: string) => ({ getId: () => id, getSheets: () => Object.values(TEST_RESET_SOURCES).find(s => s.id === id)!.requiredSheets.map(name => ({ getName: () => name, getLastRow: () => 0, getLastColumn: () => 0, getMaxRows: () => 1000, getMaxColumns: () => 26, setValues: mutation })) }) },
  };
  runInNewContext(code, context);
  expect(tokenCalls).toBe(0); expect(sourceCalls).toEqual([]); expect(logs).toEqual([]);
  expect(context.KUB_TEST_adminIdentity_().status).toBe('PASS');
  const preflight = context.KUB_TEST_readOnlyPreflight_();
  expect(preflight.status).toBe('BLOCKED'); expect(preflight.resetAllowed).toBe(false);
  expect(preflight.sources).toHaveLength(3);
  expect(preflight.sources.every((s: any) => s.dependencies.boundScripts === 'UNKNOWN' && s.dependencies.triggers === 'UNKNOWN')).toBe(true);
  expect(preflight.sources.every((s: any) => !s.blockers.includes('SOURCE_INSPECTION_FAILED'))).toBe(true);
  expect(context.KUB_TEST_reviewPending_().state).toBe('NOT_PREPARED');
  props.set('KUB_TEST_ADMIN_REQUEST_V1', JSON.stringify({ version: 1, operation: 'activate', expectedGeneration: 'missing-generation' }));
  expect(context.KUB_TEST_activate_().code).toBe('ACTIVATION_PRECONDITION_FAILED');
  props.set('KUB_TEST_ADMIN_REQUEST_V1', JSON.stringify({ version: 1, operation: 'rollback', expectedGeneration: 'missing-generation' }));
  expect(context.KUB_TEST_rollback_().code).toBe('ROLLBACK_PRECONDITION_FAILED');
  props.delete('KUB_TEST_ADMIN_REQUEST_V1');
  expect(JSON.stringify([...props])).toBe(initial); expect(props.has(TEST_CONFIG_KEY)).toBe(false);
  props.set('KUB_TEST_ADMIN_REQUEST_V1', JSON.stringify({ version: 1, operation: 'prepare', expectedGeneration: null }));
  const beforePrepare = JSON.stringify([...props]);
  expect(context.KUB_TEST_prepare_().code).toBe('PREFLIGHT_BLOCKED');
  expect(JSON.stringify([...props])).toBe(beforePrepare); expect(props.has(TEST_CONFIG_KEY)).toBe(false);
  const before = tokenCalls; scriptId = PRODUCTION_SCRIPT_ID;
  expect(context.KUB_TEST_readOnlyPreflight_().code).toBe('TEST_CONTEXT_REQUIRED'); expect(tokenCalls).toBe(before);
  expect(() => context.KUB_TEST_adminIdentity_({ subject: 'forged' })).toThrow('MANUAL_ONLY');
  expect(logs.join('')).not.toContain('vm-private-oauth-token');
  for (const name of JSON.parse(readFileSync('gas-production-entrypoints.json', 'utf8'))) expect(context[name]).toBeUndefined();
}, 30000);
