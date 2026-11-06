'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { PROVISIONAL_MAX_DISCREPANCY_MS, MAX_GOOGLE_PROOF_AGE_MS,
  createCreationClockGuard, isPreFixationTimeValid, isPostFixationTimeValid } = require('../bd2-creation-clock.cjs');

const T = 1_800_000_000_000;
const ns = ms => BigInt(ms) * 1_000_000n;
const denied = fn => assert.throws(fn, /^Error: CLOCK_GUARD_FAILED$/);
function clock(wallMs = T, monotonicNs = 0n) {
  const state = { wallMs, monotonicNs, wallCalls: 0, monotonicCalls: 0 };
  const guard = createCreationClockGuard({
    wallNow() { state.wallCalls++; return state.wallMs; },
    monotonicNow() { state.monotonicCalls++; return state.monotonicNs; },
  });
  return { state, guard };
}

test('normal progression returns original Unix samples synchronously, including identical timestamps', () => {
  const { state, guard } = clock();
  const captured = guard.observe();
  assert.equal(captured, T);
  state.monotonicNs = 500_000n;
  assert.equal(guard.observe(), T);
  state.wallMs += 20;
  state.monotonicNs = ns(20);
  assert.equal(guard.observe(), T + 20);
  state.wallMs += 90_000;
  state.monotonicNs += ns(90_000);
  assert.equal(guard.observe(), T + 90_020, 'long matching elapsed time is not a forward anomaly');
  assert.equal(captured, T, 'later observations do not change a captured timestamp');
  assert.deepEqual([state.wallCalls, state.monotonicCalls], [4, 4]);
});

test('source pair is read together in synchronous order with no retry or asynchronous yield', () => {
  const calls = [];
  const guard = createCreationClockGuard({
    wallNow() { calls.push('wall'); return T; },
    monotonicNow() { calls.push('monotonic'); return 0n; },
  });
  queueMicrotask(() => calls.push('microtask'));
  assert.equal(guard.observe(), T);
  assert.deepEqual(calls, ['wall', 'monotonic']);
});

test('any wall regression fails even when below the provisional discrepancy threshold', () => {
  const { state, guard } = clock();
  guard.observe();
  state.wallMs--;
  state.monotonicNs++;
  denied(() => guard.observe());
});

for (const direction of ['forward', 'backward-relative-to-monotonic']) {
  for (const discrepancy of [999, 1000, 1001]) {
    test(`${direction} single-step discrepancy ${discrepancy} ms: ${discrepancy < 1000 ? 'pass' : 'deny'}`, () => {
      const { state, guard } = clock();
      guard.observe();
      state.wallMs += direction === 'forward' ? discrepancy : 0;
      state.monotonicNs += direction === 'forward' ? 0n : ns(discrepancy);
      if (discrepancy < 1000) assert.equal(guard.observe(), state.wallMs);
      else denied(() => guard.observe());
    });
  }
}

for (const direction of [1, -1]) {
  test(`initial anchor catches accumulated ${direction > 0 ? 'forward' : 'backward'} drift with individually small steps`, () => {
    const { state, guard } = clock();
    guard.observe();
    const step = () => {
      state.wallMs += direction > 0 ? 1600 : 1000;
      state.monotonicNs += ns(direction > 0 ? 1000 : 1600);
    };
    step(); assert.equal(guard.observe(), state.wallMs); // 600 ms discrepancy.
    step(); denied(() => guard.observe()); // 600 ms step, 1200 ms from anchor.
  });
}

test('nanosecond precision preserves the strict threshold without truncation', () => {
  const { state, guard } = clock();
  guard.observe();
  state.monotonicNs = ns(1000) - 1n;
  assert.equal(guard.observe(), T);
  state.monotonicNs++;
  denied(() => guard.observe()); // Only 1 ns step, exactly 1000 ms from anchor.
  const other = clock();
  other.guard.observe();
  other.state.monotonicNs = ns(1000) + 1n;
  denied(() => other.guard.observe());
});

test('monotonic regression fails independently of wall progression', () => {
  const { state, guard } = clock(T, ns(10));
  guard.observe();
  state.wallMs++;
  state.monotonicNs--;
  denied(() => guard.observe());
});

test('large bigint monotonic origins remain exact without narrowing to Number', () => {
  const { state, guard } = clock(T, BigInt(Number.MAX_SAFE_INTEGER) + 1n);
  assert.equal(guard.observe(), T);
  state.wallMs++;
  state.monotonicNs += ns(1);
  assert.equal(guard.observe(), T + 1);
  state.monotonicNs += 10n ** 30n;
  denied(() => guard.observe());
});

const invalidTimestamps = [undefined, null, NaN, Infinity, -Infinity, 0, -0, -1,
  T + 0.5, Number.MAX_SAFE_INTEGER + 1, '1800000000000', 1n, true, {}, [],
  new Number(T), { valueOf() { throw Error('must not coerce'); } }];

test('invalid wall samples deny on first and later observations without rounding, clamping or coercion', () => {
  for (const bad of invalidTimestamps) {
    const first = clock(); first.state.wallMs = bad;
    denied(() => first.guard.observe());
    first.state.wallMs = T;
    denied(() => first.guard.observe());
    const later = clock(); later.guard.observe(); later.state.wallMs = bad;
    denied(() => later.guard.observe());
  }
  const upper = clock(Number.MAX_SAFE_INTEGER);
  assert.equal(upper.guard.observe(), Number.MAX_SAFE_INTEGER);
  assert.equal(clock(1).guard.observe(), 1);
});

test('invalid monotonic samples deny on first and later observations without coercion', () => {
  for (const bad of [...invalidTimestamps.filter(v => typeof v !== 'bigint'), -1n, 0, 1.5,
    '0', Promise.resolve(0n), Object(0n)]) {
    const first = clock(); first.state.monotonicNs = bad;
    denied(() => first.guard.observe());
    first.state.monotonicNs = 0n;
    denied(() => first.guard.observe());
    const later = clock(); later.guard.observe(); later.state.monotonicNs = bad;
    denied(() => later.guard.observe());
  }
});

for (const source of ['wall', 'monotonic']) {
  for (const initialFailure of [true, false]) {
    test(`${source} source throwing ${initialFailure ? 'initially' : 'later'} permanently faults its guard`, () => {
      let broken = initialFailure, calls = 0;
      const sample = value => { calls++; if (broken) throw Error('source failed'); return value; };
      const guard = createCreationClockGuard({
        wallNow: () => source === 'wall' ? sample(T) : T,
        monotonicNow: () => source === 'monotonic' ? sample(0n) : 0n,
      });
      if (!initialFailure) { assert.equal(guard.observe(), T); broken = true; }
      denied(() => guard.observe());
      const callsAtFailure = calls;
      broken = false;
      denied(() => guard.observe()); denied(() => guard.observe());
      assert.equal(calls, callsAtFailure, 'faulted guard does not read corrected sources');
    });
  }
}

test('failure is private and irreversible; a new independent operation is unaffected', () => {
  const first = clock(), independent = clock();
  const captured = first.guard.observe();
  assert.equal(independent.guard.observe(), T);
  first.state.wallMs += 1000;
  denied(() => first.guard.observe());
  first.state.wallMs = T;
  first.state.monotonicNs = 0n;
  for (let i = 0; i < 3; i++) denied(() => first.guard.observe());
  assert.deepEqual([first.state.wallCalls, first.state.monotonicCalls], [2, 2]);
  assert.equal(captured, T);
  assert.equal(independent.guard.observe(), T);
  assert.equal(clock().guard.observe(), T);
  assert.ok(Object.isFrozen(first.guard));
  assert.deepEqual(Object.keys(first.guard), ['observe'], 'no reset or recovery API');
});

test('a source cannot swallow a reentrant fault and cause a successful outer observation', () => {
  let guard;
  guard = createCreationClockGuard({
    wallNow() { denied(() => guard.observe()); return T; },
    monotonicNow: () => 0n,
  });
  denied(() => guard.observe());
  denied(() => guard.observe());
});

test('source configuration rejects nonfunctions; asynchronous samples fail closed', () => {
  for (const key of ['wallNow', 'monotonicNow']) {
    for (const bad of [null, 0, 'clock', {}])
      assert.throws(() => createCreationClockGuard({ [key]: bad }), /^TypeError: INVALID_CLOCK_SOURCE$/);
  }
  denied(() => createCreationClockGuard({ wallNow: () => Promise.resolve(T), monotonicNow: () => 0n }).observe());
});

const temporal = patch => ({ C: T - 10, V: T, S: T, t: T, D: T + 60_000, G: T + 60_000, ...patch });
const phases = [
  ['pre-fixation', isPreFixationTimeValid, value => { const { S, ...pre } = value; return pre; }],
  ['post-fixation', isPostFixationTimeValid, value => value],
];
for (const [phase, check, input] of phases) {
  for (const [age, expected] of [[0, true], [29_999, true], [30_000, false], [-1, false]]) {
    test(`${phase}: Google proof age ${age} ms -> ${expected}`, () => {
      // Negative-age case retains t = S and C <= V <= S only where mathematically possible.
      const value = age < 0 ? temporal({ V: T + 1, S: T, t: T }) : temporal({ t: T + age });
      assert.equal(check(input(value)), expected);
    });
  }
  for (const field of ['D', 'G']) {
    for (const [offset, expected] of [[-1, true], [0, false], [1, false]]) {
      test(`${phase}: t = ${field} ${offset < 0 ? '- 1' : offset > 0 ? '+ 1' : ''} -> ${expected}`, () => {
        assert.equal(check(input(temporal({ [field]: T + 100, t: T + 100 + offset }))), expected);
      });
    }
  }
  test(`${phase}: ordering equality passes, inverted original ordering/deadline denies`, () => {
    assert.equal(check(input(temporal({ C: T, V: T, S: T, t: T }))), true);
    for (const patch of [{ C: T + 1 }, { C: T, D: T }, { C: T, D: T - 1 }])
      assert.equal(check(input(temporal(patch))), false);
  });
  test(`${phase}: every timestamp rejects invalid, missing and unsafe values without repair`, () => {
    const valid = input(temporal());
    for (const key of Object.keys(valid)) {
      for (const bad of invalidTimestamps) assert.equal(check({ ...valid, [key]: bad }), false, key);
      const missing = { ...valid }; delete missing[key];
      assert.equal(check(missing), false, `missing ${key}`);
    }
    for (const bad of [undefined, null, [], 1, 'time']) assert.equal(check(bad), false);
  });
  test(`${phase}: future proofs and unsafe subtraction operands deny`, () => {
    assert.equal(check(input(temporal({ V: T + 1 }))), false);
    assert.equal(check(input(temporal({ V: -Number.MAX_SAFE_INTEGER, t: Number.MAX_SAFE_INTEGER }))), false);
    assert.equal(check(input(temporal({ V: 1, t: Number.MAX_SAFE_INTEGER + 1 }))), false);
    assert.equal(check(input(temporal({ t: T + 29_999.5 }))), false);
  });
  test(`${phase}: predicates are read-only and never fix or change S`, () => {
    const value = Object.freeze(input(temporal())), snapshot = { ...value };
    assert.equal(check(value), true);
    assert.deepEqual(value, snapshot);
    assert.equal(check(Object.freeze(input(temporal({ t: T + 30_000 })))), false);
    assert.deepEqual(value, snapshot);
  });
}

test('post-fixation enforces S >= V and t >= S, including missing S', () => {
  for (const patch of [{ S: T - 1 }, { S: T + 1 }])
    assert.equal(isPostFixationTimeValid(temporal(patch)), false);
  const { S, ...pre } = temporal();
  assert.equal(isPreFixationTimeValid(pre), true);
  assert.equal(isPostFixationTimeValid(pre), false);
});

test('safe Session hard-expiry addition: exact safe boundary passes, overflow denies', () => {
  const max = Number.MAX_SAFE_INTEGER, lifetime = 720 * 60_000;
  const safe = { C: max - lifetime, V: max - lifetime, S: max - lifetime,
    t: max - lifetime, D: max, G: max };
  assert.equal(isPostFixationTimeValid(safe), true);
  const overflow = { ...safe, C: safe.C + 1, V: safe.V + 1, S: safe.S + 1, t: safe.t + 1 };
  assert.equal(isPostFixationTimeValid(overflow), false);
  const { S, ...pre } = overflow;
  assert.equal(isPreFixationTimeValid(pre), true, 'pre-fixation does not invent S or its derived expiry');
});

test('provisional anomaly tolerance never relaxes exact temporal boundaries', () => {
  assert.equal(PROVISIONAL_MAX_DISCREPANCY_MS, 1000);
  assert.equal(MAX_GOOGLE_PROOF_AGE_MS, 30_000);
  const { state, guard } = clock();
  guard.observe();
  state.wallMs += 999; // Valid as a clock observation, not an extension of any deadline.
  const t = guard.observe();
  for (const [, check, input] of phases) {
    assert.equal(check(input(temporal({ t, D: t }))), false);
    assert.equal(check(input(temporal({ t, G: t }))), false);
    assert.equal(check(input(temporal({ C: t - 30_001, V: t - 30_000, S: t, t }))), false);
  }
});
