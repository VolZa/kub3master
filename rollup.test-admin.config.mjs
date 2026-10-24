import typescript from '@rollup/plugin-typescript';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const wrappers = { KUB_TEST_adminIdentity_: 'adminIdentity', KUB_TEST_readOnlyPreflight_: 'readOnlyPreflight',
  KUB_TEST_prepare_: 'prepareTestCopies', KUB_TEST_reviewPending_: 'reviewPending', KUB_TEST_recoverPending_: 'recoverPending',
  KUB_TEST_recordPendingReview_: 'recordPendingReview', KUB_TEST_registerReviewEvidence_: 'registerReviewEvidence',
  KUB_TEST_activate_: 'activatePendingGeneration', KUB_TEST_rollback_: 'rollbackActiveGeneration' };
export default {
  input: 'src/admin/test-reset/admin-entrypoints.ts',
  output: { dir: 'build/test-admin', entryFileNames: 'Code.gs', format: 'iife', name: '__kubTestAdminDiagnostics_', sourcemap: false },
  treeshake: true,
  plugins: [
    typescript({ tsconfig: './tsconfig.json', sourceMap: false, incremental: false }),
    { name: 'test-admin-only-surface', generateBundle(options, bundle) {
      if (path.resolve(options.dir) !== path.resolve('build/test-admin')) throw Error('TEST admin output must be isolated');
      const code = bundle['Code.gs'];
      for (const [name, target] of Object.entries(wrappers)) code.code += `\nfunction ${name}() { if (arguments.length) throw new Error('MANUAL_ONLY'); return __kubTestAdminDiagnostics_.${target}(); }\n`;
      const parsed = ts.createSourceFile('Code.gs', code.code, ts.ScriptTarget.Latest, true);
      const names = parsed.statements.filter(ts.isFunctionDeclaration).map(n => n.name?.text).sort();
      if (JSON.stringify(names) !== JSON.stringify(Object.keys(wrappers).sort())) throw Error('Unexpected TEST admin global functions');
      if (/\b(?:doGet|doPost|onOpen|onEdit|setValues|setTrashed)\b/.test(code.code)) throw Error('Mutation or production surface in TEST admin bundle');
      this.emitFile({ type: 'asset', fileName: 'appsscript.json', source: fs.readFileSync('targets/test-admin/appsscript.json', 'utf8') });
    } },
  ],
};
