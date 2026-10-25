const fs = require('node:fs');
const path = require('node:path');
const contract = require('./admin-target-contract.cjs');

function checkAdminTarget(environment, outputDirectory = `build/admin-${String(environment).toLowerCase()}`) {
  contract.validateTargetPair();
  const config = contract.readConfiguration(environment);
  if (path.resolve(outputDirectory) !== path.resolve(`build/admin-${environment.toLowerCase()}`)) throw Error('ADMIN_OUTPUT_BLOCKED');
  if (!contract.same(fs.readdirSync(outputDirectory).sort(), ['Admin.html', 'Code.gs', 'appsscript.json'])) throw Error('ADMIN_OUTPUT_INVALID');
  const read = name => fs.readFileSync(path.join(outputDirectory, name), 'utf8');
  const manifestSource = fs.readFileSync(`${contract.targetDirectory(environment)}/appsscript.json`, 'utf8');
  if (read('appsscript.json') !== manifestSource || !contract.same(JSON.parse(manifestSource), contract.manifest)) throw Error('ADMIN_MANIFEST_BLOCKED');
  contract.inspectCode(read('Code.gs'), environment, config);
  if (read('Admin.html') !== contract.readHtml()) throw Error('ADMIN_HTML_INVALID');
  const localClasp = `${contract.targetDirectory(environment)}/.clasp.json`;
  if (fs.existsSync(localClasp)) throw Error('ADMIN_LOCAL_CLASP_NOT_ALLOWED');
  const example = JSON.parse(fs.readFileSync(`${localClasp}.example`, 'utf8'));
  if (!contract.same(example, { scriptId: `REPLACE_WITH_NEW_ADMIN_${environment}_SCRIPT_ID`, rootDir: `../../build/admin-${environment.toLowerCase()}` })) throw Error('ADMIN_EXAMPLE_INVALID');
  return { status: 'PASS', environment, configurationStatus: config.scriptIds[environment] === null ? 'NOT_CONFIGURED' : 'CONFIGURED',
    globals: contract.globals, deploymentAllowed: false, resetAllowed: false };
}
if (require.main === module) {
  try {
    const requested = process.argv.slice(2);
    if (requested.length > 1) throw Error('ADMIN_TARGET_INVALID');
    console.log(JSON.stringify((requested.length ? requested : contract.environments).map(env => checkAdminTarget(env))));
  } catch { console.error('ADMIN_TARGET_CHECK_FAILED'); process.exitCode = 1; }
}
module.exports = { checkAdminTarget };
