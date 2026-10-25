import { expect, it } from 'vitest';
import { composeAdminShell } from './composition';
import { requireAdminBusinessAccess } from './authorization';
import { resolveAdminEnvironment } from './environment-context';
import type { AdminEnvironment, AdminTargetConfiguration } from './contracts';

const ids = { PRODUCTION: 'synthetic-admin-production-script-001', TEST: 'synthetic-admin-test-script-0000001' };
const urls = { PRODUCTION: 'https://script.google.com/macros/s/synthetic-production-deployment-001/exec',
  TEST: 'https://script.google.com/macros/s/synthetic-test-deployment-0000001/exec' };
function config(environment: AdminEnvironment): AdminTargetConfiguration {
  return { version: 1, environment, scriptIds: { ...ids }, environmentUrls: { ...urls } };
}
it.each(['PRODUCTION', 'TEST'] as const)('returns only public shell metadata for %s even with a valid installation', environment => {
  const shell = composeAdminShell(environment, config(environment), () => ids[environment]);
  expect(shell.bootstrap()).toEqual({ environment, applicationStatus: 'BLOCKED', configurationStatus: 'CONFIGURED',
    sections: [{ id: 'MASTER', title: 'MASTER', enabled: false }, { id: 'MANUFACTURING', title: 'Виробництво', enabled: false },
      { id: 'ADMINISTRATION', title: 'Адміністрування', enabled: false }], generationStatus: 'NOT_CONNECTED', resetAllowed: false });
  expect(Object.isFrozen(shell.bootstrap())).toBe(true);
  expect(Object.isFrozen(shell.bootstrap().sections)).toBe(true);
  const publicJson = JSON.stringify(shell.bootstrap());
  for (const value of [...Object.values(ids), ...Object.values(urls), 'scriptIds', 'environmentUrls', 'subject', 'email', 'permissions'])
    expect(publicJson).not.toContain(value);
  expect(() => requireAdminBusinessAccess()).toThrow('ACCESS_DENIED');
});
it.each([null, undefined, { version: 1, environment: 'TEST', scriptIds: { PRODUCTION: null, TEST: null }, environmentUrls: { PRODUCTION: null, TEST: null } }])(
  'keeps absent configuration blocked (%#)', configuration => {
    expect(composeAdminShell('TEST', configuration, () => ids.TEST).bootstrap()).toMatchObject({
      environment: 'TEST', applicationStatus: 'BLOCKED', configurationStatus: 'NOT_CONFIGURED', resetAllowed: false });
  });
it.each(['unknown-script-000000000000', ids.PRODUCTION, null, ''])('does not route a TEST target through another Script ID (%#)', actual => {
  const shell = composeAdminShell('TEST', config('TEST'), () => actual);
  expect(shell.bootstrap()).toMatchObject({ environment: 'TEST', configurationStatus: 'SCRIPT_ID_MISMATCH', applicationStatus: 'BLOCKED' });
  expect(shell.view().switchUrl).toBeNull();
});
it('sanitizes a Script ID runtime failure without reading other services', () => {
  const shell = composeAdminShell('TEST', config('TEST'), () => { throw Error('PRIVATE_RUNTIME_ERROR'); });
  expect(shell.bootstrap().configurationStatus).toBe('SCRIPT_ID_MISMATCH');
  expect(JSON.stringify(shell.bootstrap())).not.toContain('PRIVATE_RUNTIME_ERROR');
});
it.each(['environment', 'version', 'same-id', 'placeholder', 'extra-field', 'extra-url', 'missing-key', 'same-url'])('rejects malformed or ambiguous configuration: %s', mode => {
  const value: any = config('TEST');
  if (mode === 'environment') value.environment = 'PRODUCTION';
  if (mode === 'version') value.version = 2;
  if (mode === 'same-id') value.scriptIds.TEST = ids.PRODUCTION;
  if (mode === 'placeholder') value.scriptIds.TEST = 'REPLACE_WITH_ADMIN_TEST_SCRIPT_ID';
  if (mode === 'extra-field') value.spreadsheetId = 'browser-selected-book';
  if (mode === 'extra-url') value.environmentUrls.extra = urls.TEST;
  if (mode === 'missing-key') delete value.scriptIds.PRODUCTION;
  if (mode === 'same-url') value.environmentUrls.TEST = urls.PRODUCTION;
  const shell = composeAdminShell('TEST', value, () => ids.TEST);
  expect(shell.bootstrap().configurationStatus).toBe('INVALID'); expect(shell.view().switchUrl).toBeNull();
});
it.each(['https://evil.invalid/exec', 'javascript:alert(1)', '//script.google.com/macros/s/synthetic-production-deployment-001/exec',
  urls.PRODUCTION + '?redirect=https://evil.invalid', urls.PRODUCTION + '#fragment', urls.PRODUCTION.replace('/exec', '/dev'),
  'https://script.google.com.evil.invalid/macros/s/synthetic-production-deployment-001/exec'])('never provides an unapproved switch URL (%#)', url => {
  const value = config('TEST'); value.environmentUrls.PRODUCTION = url;
  expect(resolveAdminEnvironment('TEST', value, ids.TEST)).toMatchObject({ configurationStatus: 'INVALID', switchUrl: null });
});
it('switches only to the configured opposite deployment and disables a missing link', () => {
  expect(composeAdminShell('TEST', config('TEST'), () => ids.TEST).view().switchUrl).toBe(urls.PRODUCTION);
  expect(composeAdminShell('PRODUCTION', config('PRODUCTION'), () => ids.PRODUCTION).view().switchUrl).toBe(urls.TEST);
  const value = config('TEST'); value.environmentUrls.PRODUCTION = null;
  expect(composeAdminShell('TEST', value, () => ids.TEST).view().switchUrl).toBeNull();
});
it('never accepts browser environment, resource, role or generation claims', () => {
  const shell = composeAdminShell('TEST', config('TEST'), () => ids.TEST);
  const forged = { environment: 'PRODUCTION', spreadsheetId: 'arbitrary-book', roles: ['ADMIN'], generation: 'forged' };
  expect(Reflect.apply(shell.bootstrap, null, [forged])).toEqual(shell.bootstrap());
  expect(shell.bootstrap()).toMatchObject({ environment: 'TEST', generationStatus: 'NOT_CONNECTED', applicationStatus: 'BLOCKED', resetAllowed: false });
  expect(() => Reflect.apply(requireAdminBusinessAccess, null, [forged])).toThrow('ACCESS_DENIED');
});
it.each([null, undefined, 'UNKNOWN', 'production', {}])('rejects unknown build environment without a default (%#)', environment => {
  expect(() => composeAdminShell(environment, config('TEST'), () => ids.TEST)).toThrow('ADMIN_TARGET_BLOCKED');
});
