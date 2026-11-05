import { describe, expect, it } from 'vitest';
import { PERMISSIONS, ROLES, PermissionService, verifiedIdentity, type Role, type SecurityEnvironment } from '../permission-service';
import { BD2_PROFILE, type Bd2Context } from './contracts';
import { validateCanonicalPrincipal, validateBd2Context, validateBd2User, validateBd2Session,
  validateSessionPolicyConfig } from './validation';
import { createPortablePermissionAdapter, type PortablePermissionAdapterOptions } from './portable-permission-adapter';

const S = 1_800_000_000_000, minute = 60_000;
const context = (environment: SecurityEnvironment = 'PRODUCTION'): Bd2Context => ({
  environment, applicationAudience: 'bd2-local', expectedScriptId: 'isolated-no-GAS' });
const principal = () => ({ issuer: 'https://accounts.google.com' as const, sub: 'offline-bd2-subject' });
const header = (environment: SecurityEnvironment = 'PRODUCTION') => ({ profile: BD2_PROFILE, schemaVersion: 1 as const, context: context(environment) });
const user = (environment: SecurityEnvironment = 'PRODUCTION') => ({ ...header(environment), principal: principal(),
  active: true, roles: ['ADMIN'] as Role[], authorizationVersion: 7, revision: 1 });
const session = (environment: SecurityEnvironment = 'PRODUCTION') => ({ ...header(environment), principal: principal(),
  sessionDigest: 'a'.repeat(64), createOperationId: 'b'.repeat(64), createdAtMs: S, lastEligibleActivityAtMs: S,
  policySnapshot: { policyVersion: 1, idleTimeoutMinutes: 180, absoluteTimeoutMinutes: 720 as const },
  authorizationVersionAtIssue: 7, revision: 0, status: 'ACTIVE' as const, revokedAtMs: null });
const policy = (environment: SecurityEnvironment = 'PRODUCTION') => ({ ...header(environment), policyVersion: 1,
  idleTimeoutMinutes: 180, absoluteTimeoutMinutes: 720 as const, appliesTo: 'NEW_SESSIONS_ONLY' as const,
  updatedAtMs: S, updatedBy: principal() });
const denied = (promise: Promise<unknown>) => expect(promise).rejects.toThrow('ACCESS_DENIED');

/** Test-only authority/provenance fixture, never exported or bundled. A real server reader
 * must supply its own reviewed live provenance/consistency/clock guarantees. */
function fixture(environment: SecurityEnvironment = 'PRODUCTION') {
  const state: { user: any; session: any; currentPolicy: any } = { user: user(environment), session: session(environment), currentPolicy: policy(environment) };
  const control = { clock: S, reads: 0, onRead: undefined as undefined | (() => void | Promise<void>),
    onClock: undefined as undefined | (() => void) };
  const handle = Object.freeze({}), owned = new WeakSet([handle]);
  const options = { expectedContext: context(environment), now: () => { control.onClock?.(); return control.clock; },
    reader: { async read(value: unknown) {
      if (!value || typeof value !== 'object' || !owned.has(value)) throw Error('fixture handle denied');
      control.reads++; await control.onRead?.(); return state;
    } } };
  return { state, control, handle, options, adapter: createPortablePermissionAdapter(options) };
}

describe('B/D2 structural contracts: data, never authenticated store evidence', () => {
  it('accepts the exact profile and returns detached, deeply immutable projections', () => {
    const input = session(), parsed = validateBd2Session(input, context());
    expect(parsed).toEqual(input); expect(parsed).not.toBe(input);
    for (const value of [parsed, parsed.principal, parsed.context, parsed.policySnapshot]) expect(Object.isFrozen(value)).toBe(true);
    input.principal.sub = 'changed'; (input.context as { applicationAudience: string }).applicationAudience = 'changed'; input.policySnapshot.idleTimeoutMinutes = 30;
    expect(parsed.principal.sub).toBe('offline-bd2-subject'); expect(parsed.policySnapshot.idleTimeoutMinutes).toBe(180);
    const u = user(), v = validateBd2User(u, context()); u.roles.splice(0, 1, 'MANAGER');
    expect(v.roles).toEqual(['ADMIN']); expect(Object.isFrozen(v.roles)).toBe(true);
    const p = policy(), q = validateSessionPolicyConfig(p, context()); p.updatedBy.sub = 'changed';
    expect(q.updatedBy.sub).toBe('offline-bd2-subject'); expect(Object.isFrozen(q.updatedBy)).toBe(true);
  });
  const records = [
    ['User', user, validateBd2User], ['Session', session, validateBd2Session], ['Policy', policy, validateSessionPolicyConfig],
  ] as const;
  for (const [name, make, validate] of records) {
    it.each([{ profile: 'LEGACY' }, { profile: undefined }, { schemaVersion: 0 }, { schemaVersion: '1' },
      { authenticationExpiresAt: S + minute }, { grantId: 'c'.repeat(64) }, { rolesFromBrowser: ['ADMIN'] }])(`${name} rejects mixed/unknown schema %j`, patch => {
      expect(() => validate({ ...make(), ...patch }, context())).toThrow('ACCESS_DENIED');
    });
    it.each(['environment', 'applicationAudience', 'expectedScriptId'])(`${name} rejects substituted %s`, field => {
      const value = make(); const target: any = { ...value, context: { ...value.context, [field]: field === 'environment' ? 'TEST' : 'other' } };
      expect(() => validate(target, context())).toThrow('ACCESS_DENIED');
    });
  }
  it.each([null, {}, { issuer: 'accounts.google.com', sub: 'x' }, { issuer: 'https://evil.invalid', sub: 'x' },
    { issuer: 'https://accounts.google.com', sub: '' }, { issuer: 'https://accounts.google.com', sub: 1 },
    { issuer: 'https://accounts.google.com', sub: 'with space' }, { issuer: 'https://accounts.google.com', sub: 'x'.repeat(256) },
    { ...principal(), subject: 'alias' }, { ...principal(), email: 'untrusted@example.invalid' }])('rejects noncanonical principal %j', value => {
    expect(() => validateCanonicalPrincipal(value)).toThrow('ACCESS_DENIED');
  });
  it.each([null, {}, { ...context(), environment: 'UNKNOWN' }, { ...context(), applicationAudience: '' },
    { ...context(), expectedScriptId: '' }, { ...context(), extra: true }])('rejects malformed context %j', value => {
    expect(() => validateBd2Context(value)).toThrow('ACCESS_DENIED');
  });
  it.each([null, 'ADMIN', ['OWNER'], ['ERP_OWNER'], ['SECURITY_MANAGER'], ['ADMIN', 'ADMIN'], ['ADMIN', 'unknown']])('rejects roles %j', roles => {
    expect(() => validateBd2User({ ...user(), roles }, context())).toThrow('ACCESS_DENIED');
  });
  it('rejects accessors, symbols, non-data properties, non-plain records and sparse/extended role arrays', () => {
    let getters = 0;
    const value = { ...user(), get active() { getters++; return true; } };
    const roleAccessor = ['ADMIN']; Object.defineProperty(roleAccessor, '0', { get() { getters++; return 'ADMIN'; }, enumerable: true });
    const extraRoles = Object.assign(['ADMIN'], { custom: true });
    const nonEnumerable = { ...user() }; Object.defineProperty(nonEnumerable, 'active', { value: true, enumerable: false });
    for (const bad of [value, { ...user(), [Symbol('untrusted')]: true }, Object.assign(Object.create({}), user()), nonEnumerable,
      { ...user(), roles: roleAccessor }, { ...user(), roles: new Array(1) }, { ...user(), roles: extraRoles }]) {
      expect(() => validateBd2User(bad, context())).toThrow('ACCESS_DENIED');
    }
    expect(getters).toBe(0);
  });
  it.each([NaN, Infinity, -1, 1.5, '1', Number.MAX_SAFE_INTEGER + 1])('rejects unsafe numeric fields %j', invalid => {
    for (const key of ['authorizationVersion', 'revision']) expect(() => validateBd2User({ ...user(), [key]: invalid }, context())).toThrow();
    for (const key of ['createdAtMs', 'lastEligibleActivityAtMs', 'authorizationVersionAtIssue', 'revision'])
      expect(() => validateBd2Session({ ...session(), [key]: invalid }, context())).toThrow();
    for (const key of ['policyVersion', 'idleTimeoutMinutes', 'updatedAtMs'])
      expect(() => validateSessionPolicyConfig({ ...policy(), [key]: invalid }, context())).toThrow();
    expect(() => validateBd2Session({ ...session(), policySnapshot: { ...session().policySnapshot, policyVersion: invalid } }, context())).toThrow();
  });
  it.each([30, 180, 360])('accepts idle %i with absolute 720', idleTimeoutMinutes => {
    expect(validateSessionPolicyConfig({ ...policy(), idleTimeoutMinutes }, context()).idleTimeoutMinutes).toBe(idleTimeoutMinutes);
    expect(validateBd2Session({ ...session(), policySnapshot: { ...session().policySnapshot, idleTimeoutMinutes } }, context()).policySnapshot.idleTimeoutMinutes).toBe(idleTimeoutMinutes);
  });
  it.each([{ idleTimeoutMinutes: 29 }, { idleTimeoutMinutes: 361 }, { idleTimeoutMinutes: 30.5 },
    { idleTimeoutMinutes: '180' }, { absoluteTimeoutMinutes: 719 }, { absoluteTimeoutMinutes: '720' },
    { policyVersion: 0 }, { appliesTo: 'ALL_SESSIONS' }])('rejects invalid policy %j', patch => {
    expect(() => validateSessionPolicyConfig({ ...policy(), ...patch }, context())).toThrow();
  });
  it('rejects timestamp zero, backwards activity, invalid revocation, digest and arithmetic overflow', () => {
    const overflowS = Number.MAX_SAFE_INTEGER - 1, hard = Number.MAX_SAFE_INTEGER;
    for (const patch of [{ createdAtMs: 0 }, { lastEligibleActivityAtMs: S - 1 }, { revokedAtMs: S },
      { sessionDigest: 'raw-credential' }, { createOperationId: '' }, { status: 'UNKNOWN' },
      { status: 'REVOKED', revokedAtMs: null }, { status: 'REVOKED', revokedAtMs: S - 1 },
      { createdAtMs: overflowS, lastEligibleActivityAtMs: overflowS },
      { createdAtMs: hard - 720 * minute, lastEligibleActivityAtMs: hard - 1 }]) {
      expect(() => validateBd2Session({ ...session(), ...patch }, context())).toThrow('ACCESS_DENIED');
    }
    expect(() => validateSessionPolicyConfig({ ...policy(), updatedAtMs: 0 }, context())).toThrow();
  });
  it('valid terminal/inactive records remain inspectable data, not authorization', () => {
    expect(validateBd2User({ ...user(), active: false, roles: [] }, context()).active).toBe(false);
    expect(validateBd2Session({ ...session(), status: 'EXPIRED' }, context()).status).toBe('EXPIRED');
    expect(validateBd2Session({ ...session(), status: 'REVOKED', revokedAtMs: S }, context()).status).toBe('REVOKED');
  });
});

describe('portable adapter reuses the unchanged permission mapping', () => {
  for (const environment of ['PRODUCTION', 'TEST'] as const) for (const role of ROLES) {
    it.each(PERMISSIONS)(`${environment}/${role}/%s agrees with original core`, async permission => {
      const f = fixture(environment); f.state.user.roles = [role];
      const identity = verifiedIdentity(principal().issuer, principal().sub, S + 180 * minute);
      const direct = new PermissionService({ find: () => ({ issuer: principal().issuer, subject: principal().sub,
        active: true, roles: [role], authorizationVersion: 7 }) }, () => S, environment);
      let allowed = true; try { direct.require(identity, permission); } catch { allowed = false; }
      if (allowed) expect(await f.adapter.require(f.handle, permission)).toBeUndefined();
      else await denied(f.adapter.require(f.handle, permission));
      expect(f.control.reads).toBe(1);
    });
  }
  it('maps sub to legacy subject without requiring email and never changes or returns the snapshot', async () => {
    const f = fixture(), before = JSON.stringify(f.state);
    expect(await f.adapter.require(f.handle, 'USER_MANAGE')).toBeUndefined();
    expect(JSON.stringify(f.state)).toBe(before);
  });
  it.each([undefined, null, {}, { expectedContext: context() }, { expectedContext: context(), reader: {}, now: (): number => S },
    { expectedContext: { ...context(), environment: 'UNKNOWN' }, reader: { read: async () => ({}) }, now: (): number => S }])('unconfigured options deny %j', async options => {
    const adapter = createPortablePermissionAdapter(options as PortablePermissionAdapterOptions);
    await denied(adapter.require({}, 'REPORT_VIEW'));
  });
  it.each([undefined, null, '', 'UNKNOWN', 'SESSION_POLICY_MANAGE', 'toString', 1, {}])('unknown permission denies %j', async permission => {
    const f = fixture(); await denied(f.adapter.require(f.handle, permission)); expect(f.control.reads).toBe(0);
  });
  it('missing, forged, JSON-copied and foreign reader handles deny', async () => {
    const f = fixture(), other = fixture();
    for (const handle of [undefined, null, {}, JSON.parse(JSON.stringify(f.handle)), f.state, other.handle]) await denied(f.adapter.require(handle, 'REPORT_VIEW'));
  });
  it.each(['user', 'session', 'currentPolicy'])('missing %s denies without a fallback', async field => {
    const f = fixture(); delete f.state[field as keyof typeof f.state]; await denied(f.adapter.require(f.handle, 'REPORT_VIEW'));
  });
  it('rechecks active state, versions, roles and revocation on every independent call', async () => {
    for (const mutate of [(f: ReturnType<typeof fixture>) => { f.state.user.active = false; },
      (f: ReturnType<typeof fixture>) => { f.state.user.roles = ['MANAGER']; },
      (f: ReturnType<typeof fixture>) => { f.state.user.authorizationVersion++; },
      (f: ReturnType<typeof fixture>) => { f.state.session.status = 'REVOKED'; f.state.session.revokedAtMs = S; }]) {
      const f = fixture(); await f.adapter.require(f.handle, 'BOM_EDIT'); mutate(f);
      await denied(f.adapter.require(f.handle, 'BOM_EDIT')); expect(f.control.reads).toBe(2);
    }
  });
  it.each(['EXPIRED', 'REVOKED'])('terminal %s denies', async status => {
    const f = fixture(); f.state.session.status = status; if (status === 'REVOKED') f.state.session.revokedAtMs = S;
    await denied(f.adapter.require(f.handle, 'REPORT_VIEW'));
  });
  it('principal, environment, malformed roles and empty grants deny', async () => {
    const patches = [(f: ReturnType<typeof fixture>) => { f.state.user.principal.sub = 'another-account'; },
      (f: ReturnType<typeof fixture>) => { f.state.session.context.environment = 'TEST'; },
      (f: ReturnType<typeof fixture>) => { f.state.user.roles = ['ADMIN', 'OWNER']; },
      (f: ReturnType<typeof fixture>) => { f.state.user.roles = []; }];
    for (const mutate of patches) { const f = fixture(); mutate(f); await denied(f.adapter.require(f.handle, 'REPORT_VIEW')); }
  });
  it('uses fresh time after reader I/O and denies future S/A', async () => {
    const f = fixture(); f.control.clock = S + 180 * minute - 1;
    f.control.onRead = async () => { await Promise.resolve(); f.control.clock++; };
    await denied(f.adapter.require(f.handle, 'REPORT_VIEW'));
    for (const field of ['createdAtMs', 'lastEligibleActivityAtMs']) {
      const g = fixture(); g.state.session[field] = S + 1; await denied(g.adapter.require(g.handle, 'REPORT_VIEW'));
    }
  });
  it('awaits the authoritative reader and observes disable/revoke before its completion', async () => {
    for (const terminal of ['disable', 'revoke']) {
      const f = fixture(); let release!: () => void;
      f.control.onRead = () => new Promise<void>(resolve => { release = resolve; });
      let settled = false;
      const result = f.adapter.require(f.handle, 'REPORT_VIEW');
      void result.then(() => { settled = true; }, () => { settled = true; });
      await Promise.resolve(); expect(settled).toBe(false); expect(f.control.reads).toBe(1);
      if (terminal === 'disable') f.state.user.active = false;
      else { f.state.session.status = 'REVOKED'; f.state.session.revokedAtMs = S; }
      release(); await denied(result);
    }
  });
  it('allows before idle/hard expiry and denies equality and later observations', async () => {
    for (const hard of [false, true]) for (const delta of [-1, 0, 1]) {
      const f = fixture();
      if (hard) f.state.session.lastEligibleActivityAtMs = S + 700 * minute;
      f.control.clock = S + (hard ? 720 : 180) * minute + delta;
      if (delta < 0) await f.adapter.require(f.handle, 'REPORT_VIEW'); else await denied(f.adapter.require(f.handle, 'REPORT_VIEW'));
    }
  });
  it('keeps captured T despite shorter/longer current policy, with no legacy 15-minute/upstream cap', async () => {
    for (const idleTimeoutMinutes of [30, 360]) {
      const f = fixture(); f.state.currentPolicy = { ...policy(), policyVersion: 2, idleTimeoutMinutes };
      f.control.clock = S + 120 * minute; await f.adapter.require(f.handle, 'REPORT_VIEW');
      expect(f.state.session.policySnapshot).toEqual(session().policySnapshot);
    }
    const f = fixture(); f.state.currentPolicy = null; await denied(f.adapter.require(f.handle, 'REPORT_VIEW'));
  });
  it.each([NaN, Infinity, 0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])('invalid clock %j denies', async clock => {
    const f = fixture(); f.control.clock = clock; await denied(f.adapter.require(f.handle, 'REPORT_VIEW'));
  });
  it('clock rollback after an allow or during read denies without retaining an allow', async () => {
    const f = fixture(); await f.adapter.require(f.handle, 'REPORT_VIEW'); f.control.clock--;
    await denied(f.adapter.require(f.handle, 'REPORT_VIEW'));
    const g = fixture(); g.control.onRead = () => { g.control.clock--; }; await denied(g.adapter.require(g.handle, 'REPORT_VIEW'));
  });
  it('captures configuration/method references and detaches nested snapshot data before clock callbacks', async () => {
    const f = fixture(); (f.options.expectedContext as { environment: string }).environment = 'TEST';
    f.options.reader.read = async () => { throw Error('replacement must not run'); };
    let observations = 0;
    f.control.onClock = () => { if (++observations === 2) { f.state.user.roles = ['MANAGER']; f.state.session.policySnapshot.idleTimeoutMinutes = 30; } };
    await f.adapter.require(f.handle, 'BOM_EDIT');
    await denied(f.adapter.require(f.handle, 'BOM_EDIT')); expect(f.control.reads).toBe(2);
  });
  it('reader/clock errors are generic and cannot leak dependency details', async () => {
    const f = fixture(); f.control.onRead = () => { throw Error('credential-bearing upstream details'); };
    await expect(f.adapter.require(f.handle, 'REPORT_VIEW')).rejects.toThrow(/^ACCESS_DENIED$/);
    const g = fixture(); g.control.onClock = () => { throw Error('internal clock details'); };
    await expect(g.adapter.require(g.handle, 'REPORT_VIEW')).rejects.toThrow(/^ACCESS_DENIED$/);
  });
});
