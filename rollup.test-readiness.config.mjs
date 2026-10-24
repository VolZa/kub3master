import typescript from '@rollup/plugin-typescript';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const wrappers = {
  KUB_TEST_probeIdentity: 'probeIdentity',
  KUB_TEST_probeSheetsApi: 'probeSheetsApi',
  KUB_TEST_adminIdentity: 'adminIdentity',
  KUB_TEST_readOnlyPreflight: 'readOnlyPreflight',
};
const allowed = new Set([
  'src/admin/test-reset/readiness-entrypoints.ts', 'src/admin/test-reset/readiness-target.ts',
  'src/admin/test-reset/admin-identity.ts', 'src/admin/test-reset/admin-preflight.ts',
  'src/admin/test-reset/sheets-api-risk-adapter.ts',
  'src/admin/test-reset/spreadsheet-risk-inspector.ts', 'src/admin/test-reset/test-configuration.ts',
  'src/admin/test-reset/test-sources.ts', 'src/security/permission-service.ts',
  'src/security/property-user-repository.ts', 'src/infrastructure/spreadsheets/SpreadsheetConfig.ts',
  'src/infrastructure/spreadsheets/SpreadsheetInfo.ts', 'src/infrastructure/spreadsheets/SpreadsheetKey.ts',
]);
const forbidden = /\b(?:doGet|doPost|onOpen|onEdit|makeCopy|setTrashed|setProperty|setProperties|deleteProperty|deleteAllProperties|createFolder|setValues|appendRow|deleteFile|newTrigger|createTrigger)\b/;
export default {
  input: 'src/admin/test-reset/readiness-entrypoints.ts',
  output: { dir: 'build/test-readiness', entryFileNames: 'Code.gs', format: 'iife', name: '__kubTestReadiness_', sourcemap: false },
  treeshake: true,
  plugins: [
    typescript({ tsconfig: './tsconfig.json', sourceMap: false, incremental: false }),
    { name: 'test-readiness-only-surface', generateBundle(options, bundle) {
      if (path.resolve(options.dir) !== path.resolve('build/test-readiness')) throw Error('TEST readiness output must be isolated');
      for (const id of this.getModuleIds()) {
        const relative = path.relative(process.cwd(), id).replaceAll('\\', '/');
        if (!allowed.has(relative)) throw Error(`READINESS_IMPORT_BLOCKED: ${relative}`);
      }
      const chunk = bundle['Code.gs'];
      for (const [name, target] of Object.entries(wrappers)) chunk.code += `\nfunction ${name}() { if (arguments.length) throw new Error('MANUAL_ONLY'); return __kubTestReadiness_.${target}(); }\n`;
      const parsed = ts.createSourceFile('Code.gs', chunk.code, ts.ScriptTarget.Latest, true);
      const globals = parsed.statements.filter(ts.isFunctionDeclaration).map(n => n.name?.text).sort();
      if (JSON.stringify(globals) !== JSON.stringify(Object.keys(wrappers).sort())) throw Error('Unexpected TEST readiness globals');
      if (forbidden.test(chunk.code)) throw Error('Mutation, trigger or public surface in TEST readiness bundle');
      const manifestSource = fs.readFileSync('targets/test-readiness/appsscript.json', 'utf8');
      const expectedDependencies = { enabledAdvancedServices: [{ userSymbol: 'Sheets', serviceId: 'sheets', version: 'v4' }] };
      if (JSON.stringify(JSON.parse(manifestSource).dependencies) !== JSON.stringify(expectedDependencies)) throw Error('READINESS_DEPENDENCIES_BLOCKED');
      if (/\bSheets\s*(?:\.|\[)/.test(chunk.code)) throw Error('ADVANCED_SHEETS_CALL_NOT_ALLOWED');
      this.emitFile({ type: 'asset', fileName: 'appsscript.json', source: manifestSource });
    } },
  ],
};
