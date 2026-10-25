import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

function client() {
  const nodes: Record<string, any> = {};
  for (const id of ['environment', 'configurationStatus', 'bootstrapStatus', 'MASTER', 'MANUFACTURING', 'ADMINISTRATION'])
    nodes[id] = { textContent: id === 'environment' ? 'ADMIN TEST' : '', hidden: id !== 'MASTER' };
  const tabs = ['MASTER', 'MANUFACTURING', 'ADMINISTRATION'].map(section => ({ dataset: { section }, listener: () => {},
    addEventListener(_event: string, listener: () => void) { this.listener = listener; }, setAttribute() {} }));
  let success: (value: any) => void = () => {}, failure: () => void = () => {};
  const calls: unknown[][] = [];
  const runner = { withSuccessHandler(callback: typeof success) { success = callback; return runner; },
    withFailureHandler(callback: typeof failure) { failure = callback; return runner; }, getAdminBootstrap(...args: unknown[]) { calls.push(args); } };
  const source = readFileSync('src/admin/web/html/Client.html', 'utf8').replace(/^<script>\s*/, '').replace(/\s*<\/script>\s*$/, '');
  runInNewContext(source, { document: { querySelectorAll: () => tabs, getElementById: (id: string) => nodes[id] }, google: { script: { run: runner } } });
  return { nodes, tabs, calls, success: (value: any) => success(value), failure: () => failure() };
}
it('navigation changes only local panels and makes exactly one zero-argument bootstrap RPC', () => {
  const c = client(); expect(c.calls).toEqual([[]]);
  c.tabs[2].listener();
  expect(c.nodes.MASTER.hidden).toBe(true); expect(c.nodes.ADMINISTRATION.hidden).toBe(false);
  c.tabs[1].listener();
  expect(c.nodes.MANUFACTURING.hidden).toBe(false); expect(c.calls).toEqual([[]]);
});
it.each([null, { environment: 'PRODUCTION' }, { environment: 'TEST', applicationStatus: 'PASS' },
  { environment: 'TEST', applicationStatus: 'BLOCKED', generationStatus: 'NOT_CONNECTED', resetAllowed: true }])(
  'does not accept an inconsistent bootstrap or enable business controls (%#)', response => {
    const c = client(); c.success(response);
    expect(c.nodes.bootstrapStatus.textContent).toContain('не підтверджено'); expect(c.calls).toEqual([[]]);
  });
it('renders a valid public status as text and suppresses raw RPC errors', () => {
  const c = client(); c.success({ environment: 'TEST', applicationStatus: 'BLOCKED', configurationStatus: 'NOT_CONFIGURED', generationStatus: 'NOT_CONNECTED', resetAllowed: false });
  expect(c.nodes.configurationStatus.textContent).toBe('NOT_CONFIGURED');
  Reflect.apply(c.failure, null, [new Error('PRIVATE_GOOGLE_MESSAGE')]);
  expect(c.nodes.bootstrapStatus.textContent).not.toContain('PRIVATE_GOOGLE_MESSAGE');
});
