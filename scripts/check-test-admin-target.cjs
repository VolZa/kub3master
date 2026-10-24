'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..'), directory = path.join(root, 'targets/test-admin');
try {
  const expected = process.argv[2], config = JSON.parse(fs.readFileSync(path.join(directory, '.clasp.json'), 'utf8'));
  const production = JSON.parse(fs.readFileSync(path.join(root, '.clasp.json'), 'utf8'));
  if (!expected || expected.includes('REPLACE') || !/^[A-Za-z0-9_-]{20,200}$/.test(expected) || config.scriptId !== expected ||
    config.scriptId === production.scriptId || config.scriptId === '1HbCOjFYh21DdVn116JgvHDu-_23seWyTfPd1CDyGHGnKOqq4DSnEknLI' ||
    path.resolve(directory, config.rootDir) !== path.join(root, 'build/test-admin')) throw Error();
  console.log('PASS: local TEST target and isolated rootDir match the explicitly supplied TEST Script ID. Remote project not verified.');
} catch { console.error('BLOCKED: TEST target missing, invalid, production, or mismatched. No remote action performed.'); process.exitCode = 1; }
