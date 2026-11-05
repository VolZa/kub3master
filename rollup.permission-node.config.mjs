import typescript from '@rollup/plugin-typescript';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const allowed = new Set(['permission-service.ts', 'bd2/contracts.ts', 'bd2/validation.ts',
  'bd2/portable-permission-adapter.ts', 'bd2/node-entrypoint.ts'].map(p => path.resolve(root, 'src/security', p)));
export default {
  input: path.resolve(root, 'src/security/bd2/node-entrypoint.ts'),
  output: { file: path.resolve(root, 'build/permission-node/index.cjs'), format: 'cjs', exports: 'named', sourcemap: false },
  plugins: [
    typescript({ tsconfig: path.resolve(root, 'tsconfig.permission-node.json') }),
    { name: 'portable-permission-graph', generateBundle(_options, bundle) {
      for (const id of this.getModuleIds()) if (!allowed.has(path.resolve(id))) throw Error('PORTABLE_IMPORT_BLOCKED');
      for (const chunk of Object.values(bundle)) {
        if (chunk.type !== 'chunk' || chunk.imports.length || chunk.dynamicImports.length ||
          /\b(?:SpreadsheetApp|PropertiesService|UrlFetchApp|ScriptApp|DriveApp|CacheService|LockService|Utilities)\b|\bSession\s*\.|google-auth-library|@google-cloud\/firestore|node:/.test(chunk.code))
          throw Error('PORTABLE_BUNDLE_BLOCKED');
      }
    } },
  ],
};
