const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const environments = ['PRODUCTION', 'TEST'];
const globals = ['doGet', 'getAdminBootstrap'];
const modules = ['entrypoints', 'composition', 'contracts', 'build-target', 'environment-context', 'authorization',
  'features/master', 'features/manufacturing', 'features/test-reset'].map(name => `src/admin/web/${name}.ts`);
const manifest = { timeZone: 'Europe/Kyiv', runtimeVersion: 'V8', exceptionLogging: 'NONE', dependencies: {}, oauthScopes: [] };
const forbidden = /\b(?:SpreadsheetApp|DriveApp|UrlFetchApp|PropertiesService|Session|CacheService|LockService|Utilities|Sheets|SafeCommitService|TestReset|TestPreparation|makeCopy|setTrashed|setValue|setValues|appendRow|setProperty|setProperties|deleteProperty|newTrigger|getOAuthToken|eval|Function)\b/;
const fail = () => { throw Error('ADMIN_TARGET_INVALID'); };
function same(a, b) {
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return a === b;
  const keys = Object.keys(a).sort();
  return JSON.stringify(keys) === JSON.stringify(Object.keys(b).sort()) && keys.every(key => same(a[key], b[key]));
}
function exactObject(value, keys) {
  return !!value && typeof value === 'object' && !Array.isArray(value) && same(Object.keys(value).sort(), [...keys].sort());
}
function validateConfiguration(environment, config) {
  if (!environments.includes(environment) || !exactObject(config, ['version', 'environment', 'scriptIds', 'environmentUrls']) ||
    config.version !== 1 || config.environment !== environment || !exactObject(config.scriptIds, environments) ||
    !exactObject(config.environmentUrls, environments)) fail();
  const validId = id => typeof id === 'string' && /^[A-Za-z0-9_-]{20,200}$/.test(id) && !/REPLACE|PLACEHOLDER/i.test(id);
  const validUrl = url => typeof url === 'string' && /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]{20,200}\/exec$/.test(url);
  if (environments.some(env => config.scriptIds[env] !== null && !validId(config.scriptIds[env]) ||
    config.environmentUrls[env] !== null && !validUrl(config.environmentUrls[env])) ||
    config.scriptIds.PRODUCTION !== null && config.scriptIds.PRODUCTION === config.scriptIds.TEST ||
    config.environmentUrls.PRODUCTION !== null && config.environmentUrls.PRODUCTION === config.environmentUrls.TEST) fail();
  // A local shell may be completely unconfigured, but may never have a partial identity pair.
  if ((config.scriptIds.PRODUCTION === null) !== (config.scriptIds.TEST === null)) fail();
  return config;
}
function targetDirectory(environment) {
  if (!environments.includes(environment)) fail();
  return `targets/admin-${environment.toLowerCase()}`;
}
function readConfiguration(environment) {
  return validateConfiguration(environment, JSON.parse(fs.readFileSync(`${targetDirectory(environment)}/target.json`, 'utf8')));
}
function validateTargetPair() {
  const production = readConfiguration('PRODUCTION'), test = readConfiguration('TEST');
  if (!same(production.scriptIds, test.scriptIds) || !same(production.environmentUrls, test.environmentUrls)) fail();
  // Existing installations can never be repurposed as either new ADMIN project.
  const existing = ['.clasp.json', 'targets/test-admin/.clasp.json', 'targets/test-readiness/.clasp.json']
    .filter(file => fs.existsSync(file)).map(file => JSON.parse(fs.readFileSync(file, 'utf8')).scriptId);
  if (environments.some(env => production.scriptIds[env] !== null && existing.includes(production.scriptIds[env]))) fail();
}
function readHtml() {
  const directory = 'src/admin/web/html';
  let html = fs.readFileSync(`${directory}/Admin.html`, 'utf8');
  for (const [marker, name] of [['MASTER', 'Master'], ['MANUFACTURING', 'Manufacturing'], ['ADMINISTRATION', 'Administration'], ['CLIENT', 'Client']]) {
    const token = `<!-- ADMIN_${marker} -->`;
    if (html.split(token).length !== 2) fail();
    html = html.replace(token, () => fs.readFileSync(`${directory}/${name}.html`, 'utf8'));
  }
  return html;
}
function literal(node) {
  if (!node) return fail();
  if (ts.isStringLiteral(node)) return node.text;
  if (node.kind === ts.SyntaxKind.NullKeyword) return null;
  if (ts.isNumericLiteral(node)) return Number(node.text);
  if (ts.isObjectLiteralExpression(node)) return Object.fromEntries(node.properties.map(property => {
    if (!ts.isPropertyAssignment(property) || !ts.isIdentifier(property.name) && !ts.isStringLiteral(property.name)) return fail();
    return [property.name.text, literal(property.initializer)];
  }));
  return fail();
}
function inspectCode(code, environment, config) {
  const source = ts.createSourceFile('Code.gs', code, ts.ScriptTarget.Latest, true);
  if (source.parseDiagnostics.length || forbidden.test(code)) fail();
  const functions = source.statements.filter(ts.isFunctionDeclaration).map(node => node.name?.text).sort();
  if (!same(functions, globals)) fail();
  const variables = source.statements.filter(ts.isVariableStatement).flatMap(statement => statement.declarationList.declarations.map(d => d.name.getText(source)));
  if (!same(variables, ['__kubAdminShell_'])) fail();
  const bindings = new Map();
  function visit(node) {
    if (ts.isVariableDeclaration(node) && ['BUILD_ENVIRONMENT', 'BUILD_CONFIGURATION'].includes(node.name.getText(source))) {
      const name = node.name.getText(source); if (bindings.has(name)) fail(); bindings.set(name, literal(node.initializer));
    }
    if (ts.isIdentifier(node) && ['ScriptApp', 'HtmlService'].includes(node.text)) {
      const access = node.parent, call = access.parent;
      if (!ts.isPropertyAccessExpression(access) || access.expression !== node || !ts.isCallExpression(call) || call.expression !== access ||
        (node.text === 'ScriptApp' ? access.name.text !== 'getScriptId' || call.arguments.length !== 0 :
          access.name.text !== 'createTemplateFromFile' || call.arguments.length !== 1 || literal(call.arguments[0]) !== 'Admin')) fail();
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  if (bindings.get('BUILD_ENVIRONMENT') !== environment || !same(bindings.get('BUILD_CONFIGURATION'), config)) fail();
}
module.exports = { environments, globals, modules, manifest, same, validateConfiguration, targetDirectory,
  readConfiguration, validateTargetPair, readHtml, inspectCode };
