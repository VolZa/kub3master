'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, readdirSync } = require('node:fs');
const { resolve, join } = require('node:path');
const { spawnSync } = require('node:child_process');
const api = require('../../../../build/permission-node/index.cjs');
const c = require('../bd2-session-contract.cjs');
const { createSessionCreationCoordinator } = require('../bd2-session-creation-coordinator.cjs');
const ctx = { environment: 'TEST', applicationAudience: 'intent-coordinator-unit', expectedScriptId: 'isolated' };
const cmd = c.createCommand(ctx, { commandId: 'a'.repeat(64), kind: 'CREATE_SESSION',
  attempt: { collectionId: 'original_attempts', clientId: 'unit.apps.googleusercontent.com',
    attemptId: 'b'.repeat(64), bindingDigest: 'c'.repeat(64) },
  principal: { issuer: 'https://accounts.google.com', sub: 'fixture' },
  createdAtMs: 1_800_000_000_000, sessionDigest: 'd'.repeat(64) });
function fixture() {
  let row, fail = false, transactions = 0, writes = 0, reads = 0;
  const node = { collection: () => node, doc: () => node,
    async get() { reads++; return { exists: row !== undefined, data: () => row }; } };
  const firestore = { collection: () => node, async runTransaction(fn, options) {
    transactions++; assert.deepEqual(options, { maxAttempts: 1 });
    if (fail) throw Error('private exception');
    return fn({ get: () => node.get(), create(ref, value) { writes++; row = value; },
      set() { assert.fail('set'); }, update() { assert.fail('update'); }, delete() { assert.fail('delete'); } });
  } };
  return { firestore, owner: createSessionCreationCoordinator({ firestore, context: ctx }),
    fail: () => { fail = true; }, counts: () => ({ transactions, writes, reads }) };
}
function dataOnly(value) {
  assert.ok(Object.isFrozen(value));
  const visit = v => {
    assert.notEqual(typeof v, 'function');
    if (v && typeof v === 'object') for (const [key, item] of Object.entries(v)) {
      assert.ok(!['permit', 'capability', 'handoff', 'handle', 'sid', 'rawSID', 'dispatch'].includes(key)); visit(item);
    }
  };
  visit(value);
}

test('NEW/EXISTING/UNKNOWN/recovery are frozen data; forged copies cannot authorize through the default facade', async () => {
  const f = fixture(), outputs = [await f.owner.createOriginal(cmd), await f.owner.createOriginal(cmd)];
  f.fail(); outputs.push(await f.owner.createOriginal(cmd));
  outputs.push(await f.owner.lookupIntent(c.descriptor(ctx, cmd)));
  assert.deepEqual(outputs.map(o => o.status), ['NEW', 'EXISTING', 'UNKNOWN', 'FOUND']);
  for (const out of outputs) {
    dataOnly(out);
    const forged = JSON.parse(JSON.stringify(out));
    await assert.rejects(api.createPortablePermissionAdapter().require(forged, 'REPORT_VIEW'), /ACCESS_DENIED/);
    await assert.rejects(api.createPortablePermissionAdapter().require(out, 'REPORT_VIEW'), /ACCESS_DENIED/);
  }
  assert.deepEqual(f.counts(), { transactions: 3, writes: 1, reads: 3 });
});

test('no mint/dispatch/issuer API, arbitrary callback injection, or malformed DTO authority', async () => {
  const f = fixture();
  assert.deepEqual(Object.keys(require('../bd2-session-creation-coordinator.cjs')), ['createSessionCreationCoordinator']);
  assert.deepEqual(Object.keys(f.owner).sort(), ['createOriginal', 'lookupIntent']);
  const trap = () => assert.fail('external callback or Session Issuer invoked');
  for (const key of ['prepareCreation', 'dispatchOnce', 'consume', 'mint', 'issueSession']) assert.equal(f.owner[key], undefined);
  for (const key of ['dispatch', 'issuer', 'sessionIssuer', 'handoff', 'authorize', 'prepareCreation'])
    assert.throws(() => createSessionCreationCoordinator({ firestore: f.firestore, context: ctx, [key]: trap }), /ACCESS_DENIED/);
  let getters = 0;
  const bad = { ...cmd }; Object.defineProperty(bad, 'kind', { get() { getters++; return 'CREATE_SESSION'; } });
  for (const value of [null, {}, { status: 'NEW', permit: {} }, { ...cmd, capability: {} }, { ...cmd, sid: 'secret' }, bad]) {
    const out = await f.owner.createOriginal(value, trap); assert.deepEqual(out, { status: 'INVALID' }); dataOnly(out);
  }
  assert.equal(getters, 0); assert.deepEqual(f.counts(), { transactions: 0, writes: 0, reads: 0 });
  // Extra positional JS arguments are never interpreted as dispatch callbacks.
  assert.equal((await f.owner.createOriginal(cmd, trap)).status, 'NEW');
  assert.equal((await f.owner.lookupIntent(c.descriptor(ctx, cmd), trap)).status, 'FOUND');
});

test('production/facade imports exclude the foundation; dependency graph contains no D1 or issuer', () => {
  assert.deepEqual(Object.keys(api).sort(), ['BD2_PROFILE', 'createPortablePermissionAdapter', 'validateBd2Context',
    'validateBd2Session', 'validateBd2User', 'validateCanonicalPrincipal', 'validateSessionPolicyConfig'].sort());
  const root = resolve(__dirname, '../../../..'), marker = /firestore-session-creation-intent-store|bd2-session-creation-coordinator/;
  function walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (/\.[cm]?[jt]s$/.test(entry.name)) assert.doesNotMatch(readFileSync(path, 'utf8'), marker, path);
    }
  }
  walk(join(root, 'src'));
  const seen = new Set();
  function dependencies(mod) {
    if (seen.has(mod.id)) return; seen.add(mod.id); mod.children.forEach(dependencies);
  }
  dependencies(require.cache[require.resolve('../bd2-session-creation-coordinator.cjs')]);
  assert.equal(seen.size, 5);
  assert.ok([...seen].every(id => /(?:bd2-session-creation-coordinator|firestore-session-creation-intent-store|bd2-session-contract|bd2-user-contract|index)\.cjs$/.test(id)));
});

test('actual Rollup Node/GAS graphs in memory preserve curated exports, production entrypoints and forged-credential denial',
  { timeout: 60000 }, () => {
    // Equivalent graph checks to node-export.test.ts, using generate() instead of
    // its write() hook: the task forbids generated repository files outside allowlist.
    const script = `
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
(async()=>{
const {rollup}=await import('rollup');const ts=(await import('typescript')).default;
for(const file of ['rollup.permission-node.config.mjs','rollup.config.mjs']){
 const config=(await import(require('node:url').pathToFileURL(require('node:path').resolve(file)).href)).default;
 const bundle=await rollup(config);let chunk;
 try{chunk=(await bundle.generate(config.output)).output.find(c=>c.type==='chunk');}finally{await bundle.close();}
 assert.ok(chunk);assert.doesNotMatch(chunk.code,/firestore-session-creation-intent-store|bd2-session-creation-coordinator|@google-cloud\\/firestore|google-auth-library|node:crypto/);
 assert.ok(!Object.keys(chunk.modules).some(id=>/prototype[\\\\/]identity[\\\\/]live-broker/.test(id)));
 if(file.startsWith('rollup.permission')){
  assert.equal(Object.keys(chunk.modules).length,5);
  assert.equal(chunk.code,fs.readFileSync('build/permission-node/index.cjs','utf8'));
 }else{
  const ast=ts.createSourceFile('Code.gs',chunk.code,ts.ScriptTarget.Latest,true);
  const names=ast.statements.filter(ts.isFunctionDeclaration).map(n=>n.name.text).sort();
  assert.deepEqual(names,JSON.parse(fs.readFileSync('gas-production-entrypoints.json','utf8')).sort());
  const runtime={console};vm.runInNewContext(chunk.code,runtime);
  for(const name of names)assert.throws(()=>runtime[name]({roles:['ADMIN'],credential:'forged'}),/ACCESS_DENIED/);
 }
}
process.stdout.write('ISOLATION_PASS');
})().catch(e=>{console.error(e);process.exitCode=1});`;
    const child = spawnSync(process.execPath, ['-e', script], { cwd: resolve(__dirname, '../../../..'),
      encoding: 'utf8', windowsHide: true, timeout: 55000, env: { ...process.env, NODE_DISABLE_COMPILE_CACHE: '1' } });
    assert.equal(child.status, 0, child.stderr); assert.equal(child.stdout, 'ISOLATION_PASS');
  });
