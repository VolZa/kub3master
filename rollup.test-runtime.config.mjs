import typescript from '@rollup/plugin-typescript';
import path from 'node:path';
const allowed = new Set([
  'src/admin/test-runtime/runtime.ts', 'src/admin/test-runtime/resolver.ts',
  'src/admin/test-reset/test-configuration.ts', 'src/admin/test-reset/test-sources.ts',
  'src/security/permission-service.ts',
  'src/infrastructure/spreadsheets/ScopedSpreadsheetRegistry.ts',
  'src/infrastructure/spreadsheets/SpreadsheetConfig.ts', 'src/infrastructure/spreadsheets/SpreadsheetKey.ts',
]);
export default {
  input: 'src/admin/test-runtime/runtime.ts',
  output: { dir: 'build/test-runtime', entryFileNames: 'Runtime.gs', format: 'iife', name: '__kubTestRuntime_', sourcemap: false },
  plugins: [typescript({ tsconfig: './tsconfig.json', sourceMap: false, incremental: false }), {
    name: 'test-runtime-closed-import-graph',
    generateBundle() {
      for (const id of this.getModuleIds()) {
        const relative = path.relative(process.cwd(), id).replaceAll('\\', '/');
        if (!allowed.has(relative)) throw Error(`TEST_ROUTE_BLOCKED: ${relative}`);
      }
    },
  }],
};
