import { expect, it, vi } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { runInNewContext } from 'node:vm';
import { rollup } from 'rollup';
import type { AdminEnvironment } from './contracts';

const require = createRequire(import.meta.url);
const contract = require('../../../scripts/admin-target-contract.cjs');
const ids = { PRODUCTION: 'synthetic-admin-production-script-001', TEST: 'synthetic-admin-test-script-0000001' };
const urls = { PRODUCTION: 'https://script.google.com/macros/s/synthetic-production-deployment-001/exec',
  TEST: 'https://script.google.com/macros/s/synthetic-test-deployment-0000001/exec' };
async function adminBuild(environment: AdminEnvironment, configured = false) {
  const { createAdminConfig } = await import(pathToFileURL(resolve('rollup.admin.config.mjs')).href);
  const config = configured ? createAdminConfig(environment, { version: 1, environment, scriptIds: ids, environmentUrls: urls }) : createAdminConfig(environment);
  const bundle = await rollup(config);
  try {
    const result = await bundle.generate(config.output);
    return { config, code: result.output.find(item => item.type === 'chunk')!.code,
      assets: Object.fromEntries(result.output.filter(item => item.type === 'asset').map(item => [item.fileName, item.source])) };
  } finally { await bundle.close(); }
}
function runtime(code: string, scriptId: unknown) {
  const effects: string[] = [], templates: any[] = [];
  const forbidden = new Proxy({}, { get(_target, key) { effects.push(String(key)); throw Error('PRIVATE_SERVICE_ERROR'); } });
  const sandbox: any = { ScriptApp: { getScriptId: () => scriptId },
    HtmlService: { createTemplateFromFile(name: string) {
      expect(name).toBe('Admin');
      const template: any = { evaluate() { return { setTitle: (title: string) => ({ title, ...template }) }; } };
      templates.push(template); return template;
    } },
    SpreadsheetApp: forbidden, DriveApp: forbidden, UrlFetchApp: forbidden, PropertiesService: forbidden,
    Session: forbidden, LockService: forbidden, CacheService: forbidden, Utilities: forbidden,
    console: { log() { effects.push('log'); }, error() { effects.push('error'); } } };
  runInNewContext(code, sandbox);
  return { sandbox, effects, templates };
}
it.each(['PRODUCTION', 'TEST'] as const)('builds an isolated unconfigured %s target with only two GAS functions and no private reads', async environment => {
  const built = await adminBuild(environment);
  expect(built.config.output.dir).toBe(`build/admin-${environment.toLowerCase()}`);
  expect(Object.keys(built.assets).sort()).toEqual(['Admin.html', 'appsscript.json']);
  expect(JSON.parse(built.assets['appsscript.json'] as string)).toEqual(contract.manifest);
  const vm = runtime(built.code, ids[environment]);
  const names = Object.keys(vm.sandbox).filter(name => typeof vm.sandbox[name] === 'function').sort();
  expect(names).toEqual(['doGet', 'getAdminBootstrap']);
  expect(Object.keys(vm.sandbox.__kubAdminShell_).sort()).toEqual(['doGet', 'getAdminBootstrap']);
  expect(vm.sandbox.getAdminBootstrap()).toMatchObject({ environment, applicationStatus: 'BLOCKED', configurationStatus: 'NOT_CONFIGURED',
    generationStatus: 'NOT_CONNECTED', resetAllowed: false });
  expect(() => vm.sandbox.getAdminBootstrap({ environment: 'PRODUCTION', spreadsheetId: 'arbitrary-book', roles: ['ADMIN'] })).toThrow('ADMIN_REQUEST_INVALID');
  vm.sandbox.doGet({ parameter: { environment: environment === 'TEST' ? 'PRODUCTION' : 'TEST', url: urls.TEST } });
  expect(vm.templates[0]).toMatchObject({ environmentLabel: `ADMIN ${environment}`, switchUrl: null,
    environmentClass: environment === 'TEST' ? 'test' : 'production' });
  expect(vm.effects).toEqual([]);
  for (const name of ['submitBOM', 'resumeBOM', 'createManufacturingFromWeb', 'KUB_TEST_prepare_', 'KUB_TEST_activate_', 'reset', 'verifiedIdentity'])
    expect(vm.sandbox[name]).toBeUndefined();
  expect(existsSync(`targets/admin-${environment.toLowerCase()}/.clasp.json`)).toBe(false);
  const html = built.assets['Admin.html'] as string;
  for (const text of ['MASTER', 'Виробництво', 'Адміністрування', 'TEST_RESET — NOT ENABLED', 'NOT_CONNECTED']) expect(html).toContain(text);
  expect(html).not.toContain('<!-- ADMIN_');
  expect(html).not.toMatch(/submitBOM|resumeBOM|createManufacturingFromWeb|KUB_TEST_/);
  expect(readFileSync('package.json', 'utf8')).toContain('cpy html/**/*.html dist');
  expect(existsSync('html/admin')).toBe(false); // Existing production HTML copy must not collect ADMIN assets.
}, 30000);
it.each(['PRODUCTION', 'TEST'] as const)('pins a configured %s build, rejecting the other Script ID and returning no target configuration', async environment => {
  const built = await adminBuild(environment, true), vm = runtime(built.code, ids[environment]);
  expect(vm.sandbox.getAdminBootstrap()).toMatchObject({ environment, configurationStatus: 'CONFIGURED', applicationStatus: 'BLOCKED', resetAllowed: false });
  vm.sandbox.doGet();
  expect(vm.templates[0].switchUrl).toBe(urls[environment === 'TEST' ? 'PRODUCTION' : 'TEST']);
  const wrong = runtime(built.code, ids[environment === 'TEST' ? 'PRODUCTION' : 'TEST']);
  expect(wrong.sandbox.getAdminBootstrap()).toMatchObject({ environment, configurationStatus: 'SCRIPT_ID_MISMATCH', applicationStatus: 'BLOCKED' });
  wrong.sandbox.doGet(); expect(wrong.templates[0].switchUrl).toBeNull();
  for (const value of [...Object.values(ids), ...Object.values(urls), 'scriptIds', 'environmentUrls']) expect(JSON.stringify(vm.sandbox.getAdminBootstrap())).not.toContain(value);
  expect(vm.effects).toEqual([]); expect(wrong.effects).toEqual([]);
}, 30000);
it('the checker rejects extra RPCs, write capabilities, wrong environment and modified target pins', async () => {
  const built = await adminBuild('TEST'), config = contract.readConfiguration('TEST');
  expect(() => contract.inspectCode(built.code, 'TEST', config)).not.toThrow();
  for (const code of [built.code + '\nfunction writeData() {}', built.code + '\nSpreadsheetApp.openById("forged");',
    built.code.replace('ScriptApp.getScriptId()', 'ScriptApp.getOAuthToken()'), built.code.replace('"TEST"', '"PRODUCTION"')])
    expect(() => contract.inspectCode(code, 'TEST', config)).toThrow('ADMIN_TARGET_INVALID');
  expect(() => contract.inspectCode(built.code, 'PRODUCTION', config)).toThrow('ADMIN_TARGET_INVALID');
}, 30000);
it('the build rejects an import outside the shell allowlist even if it has no used exports', async () => {
  const { createAdminConfig } = await import(pathToFileURL(resolve('rollup.admin.config.mjs')).href);
  const config = createAdminConfig('TEST');
  config.plugins.unshift({ name: 'forbidden-import-fixture', transform(code: string, id: string) {
    if (id.split('\\').join('/').endsWith('/src/admin/web/entrypoints.ts')) return `import '../../security/permission-service';\n${code}`;
  } });
  const bundle = await rollup(config);
  try { await expect(bundle.generate(config.output)).rejects.toThrow('ADMIN_IMPORT_BLOCKED'); }
  finally { await bundle.close(); }
}, 30000);
it('the target checker validates complete artifacts and rejects contamination without exposing configuration', async () => {
  const built = await adminBuild('TEST');
  const { checkAdminTarget } = require('../../../scripts/check-admin-target.cjs');
  const fs = require('node:fs'), originalRead = fs.readFileSync, originalExists = fs.existsSync, originalList = fs.readdirSync;
  const directory = resolve('build/admin-test');
  let files: Record<string, string>, names: string[], localClasp = false;
  vi.spyOn(fs, 'readFileSync').mockImplementation(((file: any, ...args: any[]) => {
    const name = resolve(String(file));
    if (name.startsWith(directory + '/') || name.startsWith(directory + '\\')) {
      const key = name.slice(directory.length + 1); if (files[key] === undefined) throw Error('MISSING_ARTIFACT'); return files[key];
    }
    return originalRead(file, ...args);
  }) as any);
  vi.spyOn(fs, 'readdirSync').mockImplementation(((file: any, ...args: any[]) => resolve(String(file)) === directory ? names : originalList(file, ...args)) as any);
  vi.spyOn(fs, 'existsSync').mockImplementation(((file: any) => resolve(String(file)) === resolve('targets/admin-test/.clasp.json') ? localClasp : originalExists(file)) as any);
  try {
    for (const mode of ['valid', 'extra-file', 'html', 'manifest', 'rpc', 'write', 'local-clasp']) {
      files = { 'Code.gs': built.code, 'Admin.html': built.assets['Admin.html'] as string, 'appsscript.json': built.assets['appsscript.json'] as string };
      names = Object.keys(files).sort(); localClasp = mode === 'local-clasp';
      if (mode === 'extra-file') names.push('Writer.gs');
      if (mode === 'html') files['Admin.html'] += '<script>privateData()</script>';
      if (mode === 'manifest') files['appsscript.json'] = JSON.stringify({ ...contract.manifest, oauthScopes: ['https://www.googleapis.com/auth/spreadsheets'] });
      if (mode === 'rpc') files['Code.gs'] += '\nfunction reset() {}';
      if (mode === 'write') files['Code.gs'] += '\nPropertiesService.getScriptProperties();';
      if (mode === 'valid') expect(checkAdminTarget('TEST')).toEqual({ status: 'PASS', environment: 'TEST', configurationStatus: 'NOT_CONFIGURED',
        globals: ['doGet', 'getAdminBootstrap'], deploymentAllowed: false, resetAllowed: false });
      else expect(() => checkAdminTarget('TEST')).toThrow();
    }
    localClasp = false;
    expect(() => checkAdminTarget('UNKNOWN')).toThrow();
    expect(() => checkAdminTarget('TEST', 'dist')).toThrow('ADMIN_OUTPUT_BLOCKED');
  } finally { vi.restoreAllMocks(); }
}, 30000);
it('existing production/readiness bundles and target sources are identical before and after ADMIN builds', async () => {
  const paths = ['appsscript.json', 'gas-production-entrypoints.json', 'rollup.config.mjs', 'rollup.test-admin.config.mjs',
    'rollup.test-runtime.config.mjs', 'rollup.test-readiness.config.mjs', 'targets/test-admin/appsscript.json',
    'targets/test-readiness/appsscript.json', 'scripts/check-test-admin-target.cjs', 'scripts/check-test-readiness-target.cjs'];
  const before = paths.map(path => readFileSync(path, 'utf8'));
  async function legacy(file: string) {
    const { default: config } = await import(pathToFileURL(resolve(file)).href);
    const bundle = await rollup(config);
    try { return (await bundle.generate(config.output)).output.find(item => item.type === 'chunk')!.code; }
    finally { await bundle.close(); }
  }
  const production = await legacy('rollup.config.mjs'), readiness = await legacy('rollup.test-readiness.config.mjs');
  await adminBuild('PRODUCTION'); await adminBuild('TEST');
  expect(await legacy('rollup.config.mjs')).toBe(production);
  expect(await legacy('rollup.test-readiness.config.mjs')).toBe(readiness);
  paths.forEach((path, index) => expect(readFileSync(path, 'utf8')).toBe(before[index]));
}, 60000);
