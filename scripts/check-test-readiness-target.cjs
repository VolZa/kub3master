'use strict';

const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const targetDirectory = path.join(root, 'targets', 'test-readiness');
const buildDirectory = path.join(root, 'build', 'test-readiness');
const expectedScopes = [
  'openid',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/script.external_request',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/spreadsheets.readonly',
].sort();
const expectedGlobals = [
  'KUB_TEST_adminIdentity',
  'KUB_TEST_probeIdentity',
  'KUB_TEST_probeSheetsApi',
  'KUB_TEST_readOnlyPreflight',
].sort();
const expectedDependencies = { enabledAdvancedServices: [{ userSymbol: 'Sheets', serviceId: 'sheets', version: 'v4' }] };
const forbidden = /\b(?:doGet|doPost|onOpen|onEdit|makeCopy|setTrashed|setProperty|setProperties|deleteProperty|deleteAllProperties|createFolder|setValues|appendRow|newTrigger|createTrigger|KUB_TEST_prepare_|KUB_TEST_reviewPending_|KUB_TEST_recordPendingReview_|KUB_TEST_activate_|KUB_TEST_rollback_)\b/;

function fail(message) { throw new Error(message); }

try {
  const expected = process.argv[2];
  if (!expected || expected.includes('REPLACE') || !/^[A-Za-z0-9_-]{20,200}$/.test(expected)) fail('EXPECTED_TEST_SCRIPT_ID_INVALID');

  const target = JSON.parse(fs.readFileSync(path.join(targetDirectory, '.clasp.json'), 'utf8'));
  const production = JSON.parse(fs.readFileSync(path.join(root, '.clasp.json'), 'utf8'));
  const source = fs.readFileSync(path.join(root, 'src', 'admin', 'test-reset', 'readiness-target.ts'), 'utf8');
  const boundId = source.match(/TEST_READINESS_SCRIPT_ID\s*=\s*'([^']+)'/)?.[1];
  if (target.scriptId !== expected || boundId !== expected || target.scriptId === production.scriptId ||
      path.resolve(targetDirectory, target.rootDir) !== buildDirectory) fail('TEST_TARGET_MISMATCH');

  const files = fs.readdirSync(buildDirectory).sort();
  if (JSON.stringify(files) !== JSON.stringify(['Code.gs', 'appsscript.json'])) fail('UNEXPECTED_BUILD_FILES');
  const manifest = JSON.parse(fs.readFileSync(path.join(buildDirectory, 'appsscript.json'), 'utf8'));
  if (manifest.runtimeVersion !== 'V8' || manifest.webapp !== undefined || manifest.executionApi !== undefined ||
      JSON.stringify(manifest.dependencies) !== JSON.stringify(expectedDependencies) ||
      JSON.stringify([...manifest.oauthScopes].sort()) !== JSON.stringify(expectedScopes) ||
      JSON.stringify(manifest.urlFetchWhitelist) !== JSON.stringify(['https://openidconnect.googleapis.com/v1/userinfo', 'https://sheets.googleapis.com/v4/spreadsheets/'])) fail('MANIFEST_NOT_READINESS_ONLY');

  const code = fs.readFileSync(path.join(buildDirectory, 'Code.gs'), 'utf8');
  const ast = ts.createSourceFile('Code.gs', code, ts.ScriptTarget.Latest, true);
  const globals = ast.statements.filter(ts.isFunctionDeclaration).map(node => node.name?.text).filter(Boolean).sort();
  if (JSON.stringify(globals) !== JSON.stringify(expectedGlobals) || globals.some(name => name.endsWith('_')) || forbidden.test(code)) fail('BUNDLE_SURFACE_NOT_READINESS_ONLY');
  if (/\bSpreadsheetApp\b/.test(code) || !code.includes('https://sheets.googleapis.com/v4/spreadsheets/')) fail('READ_ONLY_SHEETS_ADAPTER_REQUIRED');
  if (/\bSheets\s*(?:\.|\[)/.test(code)) fail('ADVANCED_SHEETS_CALL_NOT_ALLOWED');

  console.log(JSON.stringify({ status: 'PASS', scriptId: expected, buildDirectory,
    globals: expectedGlobals, oauthScopes: expectedScopes, remoteProjectVerified: false }));
} catch (error) {
  console.error(`BLOCKED: ${error instanceof Error ? error.message : 'READINESS_TARGET_INVALID'}. No remote action performed.`);
  process.exitCode = 1;
}
