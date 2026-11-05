import { beforeAll, expect, it } from 'vitest';
import { rollup } from 'rollup';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

let generated = '', modules: string[] = [];
const artifact = resolve('build/permission-node/index.cjs');
beforeAll(async () => {
  const { default: config } = await import(pathToFileURL(resolve('rollup.permission-node.config.mjs')).href);
  const bundle = await rollup(config);
  try {
    const result = await bundle.write(config.output);
    const chunk = result.output.find(item => item.type === 'chunk')!;
    if (chunk.type !== 'chunk') throw Error('CJS_OUTPUT_MISSING');
    generated = chunk.code; modules = Object.keys(chunk.modules);
  } finally { await bundle.close(); }
}, 30000);

it('standard Node require loads the actual CJS artifact without TS flags; public exports are curated', () => {
  const code = `
const assert=require('node:assert/strict');
const api=require(${JSON.stringify(artifact)});
assert.deepEqual(Object.keys(api).sort(),['BD2_PROFILE','createPortablePermissionAdapter','validateBd2Context','validateBd2Session','validateBd2User','validateCanonicalPrincipal','validateSessionPolicyConfig'].sort());
for(const value of Object.values(api))assert.ok(typeof value==='function'||typeof value==='string');
for(const name of ['verifiedIdentity','PermissionService','ROLES','PERMISSIONS','testFixture','PropertyUserRepository'])assert.equal(api[name],undefined);
const at=1800000000000,ctx={environment:'PRODUCTION',applicationAudience:'node-local',expectedScriptId:'no-GAS'};
const principal={issuer:'https://accounts.google.com',sub:'fixture-node-subject'};
const header={profile:api.BD2_PROFILE,schemaVersion:1,context:ctx};
const snapshot={user:{...header,principal,active:true,roles:['ADMIN'],authorizationVersion:1,revision:0},
session:{...header,principal,sessionDigest:'a'.repeat(64),createOperationId:'b'.repeat(64),createdAtMs:at,lastEligibleActivityAtMs:at,
policySnapshot:{policyVersion:1,idleTimeoutMinutes:180,absoluteTimeoutMinutes:720},authorizationVersionAtIssue:1,revision:0,status:'ACTIVE',revokedAtMs:null},
currentPolicy:{...header,policyVersion:1,idleTimeoutMinutes:180,absoluteTimeoutMinutes:720,appliesTo:'NEW_SESSIONS_ONLY',updatedAtMs:at,updatedBy:principal}};
let reads=0;const handle={},owned=new WeakSet([handle]);
const adapter=api.createPortablePermissionAdapter({expectedContext:ctx,now:()=>at,reader:{async read(h){assert.ok(owned.has(h));reads++;return snapshot}}});
(async()=>{
assert.equal(await adapter.require(handle,'BOM_EDIT'),undefined);
snapshot.user.roles=['MANAGER'];await assert.rejects(adapter.require(handle,'BOM_EDIT'),/ACCESS_DENIED/);assert.equal(reads,2);
await assert.rejects(adapter.require({},'REPORT_VIEW'),/ACCESS_DENIED/);
await assert.rejects(api.createPortablePermissionAdapter().require(handle,'REPORT_VIEW'),/ACCESS_DENIED/);
console.log(JSON.stringify({format:'CJS',standardRequire:true,positiveSameBundleIdentity:true,noPositiveCache:true}));
})().catch(e=>{console.error(e);process.exitCode=1});`;
  const child = spawnSync(process.execPath, ['-e', code], { encoding: 'utf8', windowsHide: true,
    env: { ...process.env, NODE_OPTIONS: '', NODE_DISABLE_COMPILE_CACHE: '1' }, timeout: 15000 });
  expect(child.status, child.stderr).toBe(0); expect(JSON.parse(child.stdout)).toEqual({
    format: 'CJS', standardRequire: true, positiveSameBundleIdentity: true, noPositiveCache: true });
});

it('portable artifact has one original policy core and no GAS/Node-only dependencies or fixtures', () => {
  expect(readFileSync(artifact, 'utf8')).toBe(generated);
  expect(modules.filter(id => /[\\/]security[\\/]permission-service\.ts$/.test(id))).toHaveLength(1);
  expect(modules).toHaveLength(5);
  expect(generated).not.toMatch(/SpreadsheetApp|PropertiesService|UrlFetchApp|ScriptApp|DriveApp|\bSession\s*\.|node:|google-auth-library|@google-cloud\/firestore/);
  for (const value of ['fixture-node-subject', 'offline-bd2-subject', 'isolated-no-GAS', 'testFixture']) expect(generated).not.toContain(value);
});

it('GAS graph and globals keep production holds, excluding the portable adapter and Node packages', async () => {
  const { default: config } = await import(pathToFileURL(resolve('rollup.config.mjs')).href);
  const bundle = await rollup(config);
  let code: string, graph: string[];
  try {
    const result = await bundle.generate(config.output), chunk = result.output.find(item => item.type === 'chunk')!;
    if (chunk.type !== 'chunk') throw Error('GAS_OUTPUT_MISSING'); code = chunk.code; graph = Object.keys(chunk.modules);
  } finally { await bundle.close(); }
  expect(graph.some(id => /security[\\/]bd2[\\/]|prototype[\\/]identity[\\/]live-broker/.test(id))).toBe(false);
  expect(code).not.toMatch(/node:crypto|google-auth-library|@google-cloud\/firestore|createPortablePermissionAdapter/);
  const ast = ts.createSourceFile('Code.gs', code, ts.ScriptTarget.Latest, true);
  const names = ast.statements.filter(ts.isFunctionDeclaration).map(node => node.name!.text).sort();
  expect(names).toEqual(JSON.parse(readFileSync('gas-production-entrypoints.json', 'utf8')).sort());
  const runtime: Record<string, any> = { console }; runInNewContext(code, runtime);
  for (const name of names) expect(() => runtime[name]({ roles: ['ADMIN'], credential: 'forged' })).toThrow('ACCESS_DENIED');
  for (const name of ['createPortablePermissionAdapter', 'verifiedIdentity', 'PermissionService']) expect(runtime[name]).toBeUndefined();
}, 30000);
