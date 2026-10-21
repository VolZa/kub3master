import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { expect, it } from 'vitest';

const html = readFileSync('html/Manufacturing.html', 'utf8');
const script = /<script>([\s\S]*?)<\/script>/.exec(html)![1];
const modes = ['manufacturing', 'report', 'plan'];

function page(initialize = true, ready = true, currentState: any = { status: 'EMPTY' }, archives: any[] = []) {
  const elements: Record<string, any> = {};
  const tags = /<[^>]+\bid="([^"]+)"[^>]*>/g;
  let match: RegExpExecArray | null;
  while ((match = tags.exec(html))) {
    const tag = match[0];
    const classes = new Set((/class="([^"]*)"/.exec(tag)?.[1] || '').split(/\s+/));
    elements[match[1]] = {
      value: '',
      options: [] as any[],
      style: { display: /display:\s*([^;" ]+)/.exec(tag)?.[1] || '' },
      classList: {
        contains: (name: string) => classes.has(name),
        toggle: (name: string, active: boolean) => active ? classes.add(name) : classes.delete(name),
      },
      onclick: /onclick="([^"]*)"/.exec(tag)?.[1],
    };
  }
  for (const node of Object.values(elements)) {
    node.appendChild = (option: any) => node.options.push(option);
    Object.defineProperty(node, 'innerHTML', { set: () => { node.options = []; node.value = ''; } });
  }
  const calls: string[] = [];
  const alerts: string[] = [];
  const requests: { method: string; payload: any; success: (r: any) => void; failure: (e: any) => void }[] = [];
  const timers = new Map<number, () => void>(); let timerId = 0;
  const archiveReads = { count: 0 };
  elements.reportCalculationMethod.value = 'normative';
  elements.reportType.value = 'material-consumption';
  elements.reportFormat.value = 'google-sheet';
  elements.reportLink.removeAttribute = (name: string) => { delete elements.reportLink[name]; };
  const google = { script: { get run() {
    let success: any, failure: any;
    const runner: any = { withSuccessHandler: (fn: any) => { success = fn; return runner; },
      withFailureHandler: (fn: any) => { failure = fn; return runner; } };
    runner.getCurrentMaterialReportWeb = () => success(currentState);
    runner.listSavedMaterialReportsWeb = () => { archiveReads.count++; success({ status: 'OK', reports: archives }); };
    for (const method of ['getManufacturingHouseOptions', 'getManufacturingProductOptions', 'generateMaterialConsumptionReportWeb', 'saveMaterialConsumptionReportWeb', 'renameSavedMaterialReportWeb', 'deleteSavedMaterialReportWeb']) {
      runner[method] = (payload: any) => { calls.push(method); requests.push({ method, payload, success, failure }); };
    }
    return runner;
  } } };
  const context = createContext({
    document: { getElementById: (id: string) => elements[id], createElement: () => ({ children: [] as any[], events: {} as any,
      appendChild(child: any) { this.children.push(child); }, addEventListener(event: string, fn: () => void) { this.events[event] = fn; } }) },
    google,
    alert: (message: string) => alerts.push(message),
    console: { log: () => {}, error: () => {} },
    setTimeout: (fn: () => void) => { timers.set(++timerId, fn); return timerId; },
    clearTimeout: (id: number) => timers.delete(id),
    prompt: () => 'Renamed archive', confirm: () => true,
  });
  if (initialize) runInContext(script, context);
  if (initialize && ready) requests[requests.length - 1].success([]);
  return { elements, calls, alerts, requests, archiveReads,
    changeHouse: () => runInContext('handleReportHouseChange()', context),
    timeout: () => { for (const fn of timers.values()) fn(); timers.clear(); },
    buildReport: () => runInContext('buildReportWebInput()', context),
    saveReport: () => runInContext('saveCurrentMaterialReport()', context),
    click: (mode: string) => runInContext(elements[mode + 'Tab'].onclick, context) };
}

function expectMode(ui: ReturnType<typeof page>, active: string) {
  for (const mode of modes) {
    expect(ui.elements[mode + 'View'].style.display !== 'none').toBe(mode === active);
    expect(ui.elements[mode + 'Tab'].classList.contains('active')).toBe(mode === active);
  }
}

it('initial HTML shows only Manufacturing before JavaScript or data responses', () => {
  expectMode(page(false), 'manufacturing');
});

it('initialization selects Manufacturing while data requests remain pending', () => {
  const ui = page();
  expectMode(ui, 'manufacturing');
  expect(ui.calls).toEqual(Array(3).fill('getManufacturingHouseOptions'));
});

it('tab clicks preserve form values and nodes without fetching or saving data', () => {
  const ui = page();
  const initialCalls = ui.calls.slice();
  const fields: Record<string, any> = {};
  const tags = /<(?:input|select|textarea)\b[^>]*\bid="([^"]+)"/g;
  let match: RegExpExecArray | null;
  while ((match = tags.exec(html))) {
    fields[match[1]] = ui.elements[match[1]];
    fields[match[1]].value = 'entered:' + match[1];
  }
  expect(Object.keys(fields).length).toBeGreaterThan(0);
  for (const mode of ['manufacturing', 'report', 'plan', 'manufacturing']) {
    ui.click(mode);
    expectMode(ui, mode);
    for (const id of Object.keys(fields)) {
      expect(ui.elements[id]).toBe(fields[id]);
      expect(ui.elements[id].value).toBe('entered:' + id);
    }
  }
  expect(ui.calls).toEqual(initialCalls);
});

it('a fresh page load resets the active tab to Manufacturing', () => {
  const previous = page();
  previous.click('report');
  expectMode(previous, 'report');
  expectMode(page(), 'manufacturing');
});

it('groups the three labeled loss inputs in one three-column CSS grid', () => {
  expect(html).toMatch(/\.loss-grid\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/);
  const grid = html.split('<div class="loss-grid">')[1].split('<div class="field">')[0];
  for (const id of ['lossRebar', 'lossRolled', 'lossConcrete']) {
    expect(grid).toContain(`for="${id}"`);
    expect(grid).toContain(`id="${id}"`);
  }
});

it.each([
  ['0', '7.25', '100'],
  ['2.125', '0', '0.05'],
])('sends independent explicit percentages %s / %s / %s', (rebar, rolled, concrete) => {
  const ui = page();
  const initialCalls = ui.calls.slice();
  for (const [id, value] of Object.entries({ lossRebar: rebar, lossRolled: rolled, lossConcrete: concrete,
    reportHouseCode: 'H001', reportProductCode: 'П-2.11', reportCalculationMethod: 'normative',
    reportType: 'material-consumption', reportFormat: 'google-sheet' })) ui.elements[id].value = value;
  ui.buildReport();
  const dto = JSON.parse(JSON.stringify(ui.requests[ui.requests.length - 1].payload));
  expect(dto.lossPercents).toEqual({ rebar: Number(rebar), rolled: Number(rolled), concrete: Number(concrete) });
  expect(dto).not.toHaveProperty('lossPercent');
  expect(dto.houseCode).toBe('H001');
  expect(dto.productCode).toBe('П-2.11');
  expect(ui.calls).toEqual([...initialCalls, 'generateMaterialConsumptionReportWeb']);
  expect(ui.alerts).toEqual([]);
});

it.each(['lossRebar', 'lossRolled', 'lossConcrete'])('rejects empty, non-finite and out-of-range %s without producing DTO', id => {
  for (const invalid of ['', '  ', '-0.1', '100.1', 'NaN', 'Infinity']) {
    const ui = page();
    for (const field of ['lossRebar', 'lossRolled', 'lossConcrete']) ui.elements[field].value = '0';
    ui.elements[id].value = invalid;
    ui.buildReport();
    expect(ui.elements.reportDebug.textContent).toBeUndefined();
    expect(ui.alerts).toHaveLength(1);
    expect(ui.alerts[0]).toContain('від 0 до 100');
  }
});

function reportPage() {
  const ui = page();
  for (const [id, value] of Object.entries({ lossRebar: '7', lossRolled: '5', lossConcrete: '0',
    reportHouseCode: 'H001', reportProductCode: 'П-1' })) ui.elements[id].value = value;
  return ui;
}
it('blocks initial loading and ignores stale product responses after changing house', () => {
  const ui = page(true, false);
  expect(ui.elements.generateReportButton.disabled).toBe(true);
  ui.buildReport(); expect(ui.requests).toHaveLength(3);
  ui.requests[2].success([]);
  ui.elements.reportHouseCode.value = 'H001'; ui.changeHouse(); const old = ui.requests[3];
  ui.buildReport(); expect(ui.requests).toHaveLength(4);
  ui.elements.reportHouseCode.value = 'H002'; ui.changeHouse(); const latest = ui.requests[4];
  latest.success([{ value: 'NEW', label: 'NEW' }]);
  ui.elements.reportProductCode.value = 'NEW';
  old.success([{ value: 'OLD', label: 'OLD' }]); old.failure({ message: 'stale' });
  expect(ui.elements.reportProductCode.value).toBe('NEW');
  expect(ui.elements.reportProductCode.options.map((o: any) => o.value)).toEqual(['', 'NEW']);
  expect(ui.elements.generateReportButton.disabled).toBe(false);
});
it('sends actual DOM values once on double click and shows exact-sheet success link without clearing fields', () => {
  const ui = reportPage(); ui.elements.reportDateTo.value = '2026-06-30';
  ui.buildReport(); ui.buildReport();
  const requests = ui.requests.filter(r => r.method === 'generateMaterialConsumptionReportWeb');
  expect(requests).toHaveLength(1); expect(ui.elements.generateReportButton.disabled).toBe(true);
  expect(requests[0].payload).toMatchObject({ houseCode: 'H001', productCode: 'П-1', dateTo: '2026-06-30', lossPercents: { rebar: 7, rolled: 5, concrete: 0 } });
  const url = 'https://docs.google.com/spreadsheets/d/1Vy--GaVoUdP17Yd2PztUtXAcaf1krskxm5qvidQsoPc/edit#gid=123';
  requests[0].success({ status: 'OK', url });
  expect(ui.elements.reportLink.href).toBe(url); expect(ui.elements.reportLink.hidden).toBe(false);
  expect(ui.elements.generateReportButton.disabled).toBe(false);
  expect(ui.elements.reportProductCode.value).toBe('П-1'); expect(ui.elements.lossRolled.value).toBe('5');
});
it('intentional All Products omits only the product filter', () => {
  const ui = reportPage(); ui.elements.reportProductCode.value = ''; ui.buildReport();
  expect(ui.requests[3].payload.houseCode).toBe('H001'); expect(ui.requests[3].payload.productCode).toBeUndefined();
});
it.each(['EMPTY', 'ERROR', 'REPORT_RECOVERY_REQUIRED', 'failure', 'timeout'])('handles %s without automatic resubmission', status => {
  const ui = reportPage(); ui.buildReport(); const pending = ui.requests[3];
  if (status === 'failure') pending.failure({ message: 'network' });
  else if (status === 'timeout') { ui.timeout(); pending.success({ status: 'EMPTY' }); }
  else pending.success(status === 'EMPTY' ? { status } : { status: 'ERROR', code: status, message: 'Перевірте REPORTING' });
  expect(ui.requests).toHaveLength(4); expect(ui.elements.generateReportButton.disabled).toBe(false);
  expect(ui.elements.reportLink.hidden).toBe(true);
  expect(ui.elements.reportStatus.textContent).toContain(status === 'EMPTY' ? 'немає виготовлених' : status === 'timeout' || status === 'failure' ? 'невизначений' : status);
});
it('blocks batch-based rather than treating it as normative', () => {
  const ui = reportPage(); ui.elements.reportCalculationMethod.value = 'batch-based'; ui.buildReport();
  expect(ui.requests).toHaveLength(3); expect(ui.alerts[0]).toContain('NOT_IMPLEMENTED');
});

it('shows cleanup warning as successful publication with an available link, without retry', () => {
  const ui = reportPage(); ui.buildReport();
  ui.requests[3].success({ status: 'OK', cleanup: 'WARNING', url: 'https://docs.google.com/spreadsheets/d/1Vy--GaVoUdP17Yd2PztUtXAcaf1krskxm5qvidQsoPc/edit#gid=123' });
  expect(ui.elements.reportStatus.textContent).toContain('успішно');
  expect(ui.elements.reportStatus.textContent).toContain('Повторне формування не потрібне');
  expect(ui.elements.reportLink.hidden).toBe(false); expect(ui.requests).toHaveLength(4);
});

it('saves the generated sheet identity once, independent of changed form fields', () => {
  const ui = reportPage(); ui.buildReport();
  ui.requests[3].success({ status: 'OK', sheetId: 123, url: 'https://docs.google.com/spreadsheets/d/1Vy--GaVoUdP17Yd2PztUtXAcaf1krskxm5qvidQsoPc/edit#gid=123' });
  ui.elements.lossConcrete.value = '99'; ui.elements.reportHouseCode.value = 'OTHER';
  ui.saveReport(); ui.saveReport(); ui.buildReport();
  expect(ui.requests).toHaveLength(5); expect(ui.requests[4].payload).toEqual({ sourceSheetId: 123 });
  expect(ui.elements.saveReportButton.disabled).toBe(true);
  ui.requests[4].success({ status: 'OK', reportId: 'MC_000001', url: 'https://docs.google.com/spreadsheets/d/1Vy--GaVoUdP17Yd2PztUtXAcaf1krskxm5qvidQsoPc/edit#gid=456' });
  expect(ui.elements.savedReportLink.hidden).toBe(false); expect(ui.elements.saveReportStatus.textContent).toContain('MC_000001');
  expect(ui.elements.saveReportButton.disabled).toBe(false); expect(ui.elements.lossConcrete.value).toBe('99');
});
it.each(['failure', 'STALE_CURRENT_REPORT', 'SAVE_RECOVERY_REQUIRED', 'timeout'])('restores Save UI after %s without retry', fault => {
  const ui = reportPage(); ui.buildReport(); ui.requests[3].success({ status: 'OK', sheetId: 123,
    url: 'https://docs.google.com/spreadsheets/d/1Vy--GaVoUdP17Yd2PztUtXAcaf1krskxm5qvidQsoPc/edit#gid=123' });
  ui.saveReport(); const pending = ui.requests[4];
  if (fault === 'failure') pending.failure({});
  else if (fault === 'timeout') ui.timeout();
  else pending.success({ status: 'ERROR', code: fault, message: 'Перевірте REPORTING' });
  expect(ui.requests).toHaveLength(5); expect(ui.elements.savedReportLink.hidden).toBe(true);
  expect(ui.elements.saveReportButton.disabled).toBe(fault === 'STALE_CURRENT_REPORT');
});

it('reopening fetches current sheet identity without changing filter fields', () => {
  const ui = page(true, true, { status: 'OK', sheetId: 987 });
  expect(ui.elements.saveReportButton.disabled).toBe(false);
  expect(ui.elements.reportHouseCode.value).toBe('');
  ui.saveReport(); expect(ui.requests[3].payload).toEqual({ sourceSheetId: 987 });
  ui.requests[3].success({ status: 'ALREADY_SAVED', reportId: 'MC_000001', url: 'https://docs.google.com/spreadsheets/d/1Vy--GaVoUdP17Yd2PztUtXAcaf1krskxm5qvidQsoPc/edit#gid=456' });
  expect(ui.elements.saveReportStatus.textContent).toContain('Уже збережено');
});

const archiveFixture = { reportId: 'MC_000001', sheetId: 1878603004, sheetName: 'June report', houseCode: 'H001', productCode: 'П-1',
  dateFrom: '2026-06-30', dateTo: '2026-07-01', savedAt: '2026-10-21T12:00:00Z', state: 'ACTIVE',
  url: 'https://docs.google.com/spreadsheets/d/1Vy--GaVoUdP17Yd2PztUtXAcaf1krskxm5qvidQsoPc/edit#gid=1878603004' };
it.each(['rename', 'delete'])('archive %s sends exact immutable identity once and refreshes on success', action => {
  const ui = page(true, true, { status: 'EMPTY' }, [archiveFixture]);
  const tr = ui.elements.savedReportsBody.options[0];
  const actions = tr.children[5].children;
  expect(actions[0].href).toBe(archiveFixture.url);
  const button = actions[action === 'rename' ? 1 : 2];
  ui.elements.lossRebar.value = '19'; button.events.click(); button.events.click();
  expect(ui.requests).toHaveLength(4);
  expect(ui.requests[3].payload).toMatchObject({ reportId: 'MC_000001', sheetId: 1878603004 });
  expect(button.disabled).toBe(true);
  ui.requests[3].success({ status: 'OK' });
  expect(ui.archiveReads.count).toBe(2); expect(ui.elements.lossRebar.value).toBe('19');
});
it('archive error/timeout restores buttons and never automatically repeats mutation', () => {
  for (const fault of ['failure', 'recovery', 'timeout']) {
    const ui = page(true, true, { status: 'EMPTY' }, [archiveFixture]);
    const button = ui.elements.savedReportsBody.options[0].children[5].children[2];
    button.events.click();
    if (fault === 'failure') ui.requests[3].failure({});
    else if (fault === 'recovery') ui.requests[3].success({ status: 'ERROR', code: 'DELETE_RECOVERY_REQUIRED', message: 'Inspect' });
    else ui.timeout();
    expect(button.disabled).toBe(false); expect(ui.requests).toHaveLength(4); expect(ui.archiveReads.count).toBe(1);
  }
});
