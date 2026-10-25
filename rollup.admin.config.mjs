import typescript from '@rollup/plugin-typescript';
import fs from 'node:fs';
import path from 'node:path';
import contract from './scripts/admin-target-contract.cjs';

/** Optional configuration is a trusted local test/build port; never a GAS/browser parameter. */
export function createAdminConfig(environment, configuration = contract.readConfiguration(environment)) {
  contract.validateConfiguration(environment, configuration);
  const directory = `build/admin-${environment.toLowerCase()}`;
  return {
    input: 'src/admin/web/entrypoints.ts',
    output: { dir: directory, entryFileNames: 'Code.gs', format: 'iife', name: '__kubAdminShell_', sourcemap: false },
    treeshake: true,
    plugins: [
      { name: 'immutable-admin-build-target', transform(_code, id) {
        if (path.resolve(id) === path.resolve('src/admin/web/build-target.ts')) return {
          code: `export const BUILD_ENVIRONMENT = ${JSON.stringify(environment)};\nexport const BUILD_CONFIGURATION = ${JSON.stringify(configuration)};`, map: null };
      } },
      typescript({ tsconfig: './tsconfig.json', sourceMap: false, incremental: false }),
      { name: 'isolated-admin-surface', generateBundle(options, bundle) {
        if (path.resolve(options.dir) !== path.resolve(directory)) throw Error('ADMIN_OUTPUT_BLOCKED');
        for (const id of this.getModuleIds()) {
          const relative = path.relative(process.cwd(), id).replaceAll('\\', '/');
          if (!contract.modules.includes(relative)) throw Error('ADMIN_IMPORT_BLOCKED');
        }
        const chunk = bundle['Code.gs'];
        if (!chunk || chunk.type !== 'chunk') throw Error('ADMIN_BUILD_MISSING');
        chunk.code += '\nfunction doGet() { return __kubAdminShell_.doGet(); }\n' +
          'function getAdminBootstrap() { if (arguments.length) throw new Error("ADMIN_REQUEST_INVALID"); return __kubAdminShell_.getAdminBootstrap(); }\n';
        contract.inspectCode(chunk.code, environment, configuration);
        const manifestSource = fs.readFileSync(`${contract.targetDirectory(environment)}/appsscript.json`, 'utf8');
        if (!contract.same(JSON.parse(manifestSource), contract.manifest)) throw Error('ADMIN_MANIFEST_BLOCKED');
        this.emitFile({ type: 'asset', fileName: 'appsscript.json', source: manifestSource });
        this.emitFile({ type: 'asset', fileName: 'Admin.html', source: contract.readHtml() });
      } },
    ],
  };
}
export default command => {
  contract.validateTargetPair();
  if (command.configAdminTarget === 'PRODUCTION' || command.configAdminTarget === 'TEST') return createAdminConfig(command.configAdminTarget);
  if (command.configAdminTarget !== undefined) throw Error('ADMIN_TARGET_INVALID');
  return contract.environments.map(environment => createAdminConfig(environment));
};
