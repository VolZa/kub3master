/**
 * Path: C:/www/26/03/kub3master-ts/src/ui/bom-commit-client.test.ts
 * Module: BOM UI
 * Layer: Tests
 * Responsibility: execute both form controllers against mock DOM, storage, timers and google.script.run.
 */
import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
const source = readFileSync('html/BOMCommitClient.html', 'utf8').replace(/<\/?script>/g, '').replace('__BOM_CLIENT_SCOPE__', '"scope"');
type Call = { method: string; payload: any; success: (value: any) => void; failure: (value: any) => void };
function form(file: string, storage = new Map<string, string>(), denyStorage = false) {
  const html = readFileSync(file, 'utf8');
  const elements: Record<string, any> = {};
  for (const id of ['projectDocumentID','parentInput','specification','saveBOM','resumeBOM','newBOM','operationID','storageWarning','operationHistory','bomStatus']) {
    expect(html).toContain(`id="${id}"`);
    elements[id] = { value: '', textContent: '', disabled: false, listeners: {} as Record<string, () => void>, addEventListener: (event: string, action: () => void) => { elements[id].listeners[event] = action; } };
  }
  elements.projectDocumentID.value = '9'; elements.parentInput.value = 'Плита; П-1'; elements.specification.value = 'Арматура; R_12_A500C_L400; 4';
  const calls: Call[] = [], timers = new Map<number, () => void>(); let sequence = 0, random = 0;
  const google = { script: { get run() {
    let success: Call['success'], failure: Call['failure'];
    const runner: any = { withSuccessHandler: (fn: Call['success']) => { success = fn; return runner; }, withFailureHandler: (fn: Call['failure']) => { failure = fn; return runner; } };
    for (const method of ['submitBOM','resumeBOM']) runner[method] = (payload: unknown) => calls.push({ method, payload: JSON.parse(JSON.stringify(payload)), success, failure });
    return runner;
  } } };
  runInNewContext(source, { document: { getElementById: (id: string) => elements[id] }, google,
    localStorage: { getItem: (key: string) => { if (denyStorage) throw new Error('denied'); return storage.get(key); }, setItem: (key: string, value: string) => { if (denyStorage) throw new Error('denied'); storage.set(key, value); } },
    crypto: { getRandomValues: (bytes: Uint8Array) => bytes.fill(++random) }, confirm: () => true,
    setTimeout: (fn: () => void) => { timers.set(++sequence, fn); return sequence; }, clearTimeout: (id: number) => timers.delete(id),
  });
  return { elements, calls, storage, click: (id: string) => { if (!elements[id].disabled) elements[id].listeners.click(); }, timeout: () => { for (const fn of [...timers.values()]) fn(); timers.clear(); } };
}
for (const file of ['html/Form.html', 'html/FormTable.html']) {
  it(`${file}: double click sends one stable operation with explicit document and both handlers`, () => {
    const ui = form(file); ui.click('saveBOM'); ui.click('saveBOM'); expect(ui.calls).toHaveLength(1);
    expect(ui.calls[0].method).toBe('submitBOM'); expect(ui.calls[0].payload.projectDocumentID).toBe('9'); expect(ui.calls[0].success).toBeTypeOf('function'); expect(ui.calls[0].failure).toBeTypeOf('function');
    expect(ui.elements.operationID.value).toBe(ui.calls[0].payload.operationID);
  });
  it(`${file}: transport failure and timeout preserve ID and retry payload`, () => {
    const ui = form(file); ui.click('saveBOM'); const first = ui.calls[0]; first.failure({ message: 'lost response' });
    expect(ui.elements.bomStatus.textContent).toContain('невідомий'); ui.click('saveBOM'); expect(ui.calls[1].payload).toEqual(first.payload);
    ui.timeout(); ui.click('saveBOM'); expect(ui.calls[2].payload).toEqual(first.payload);
  });
  it(`${file}: refresh/reopen across forms restores document and resumes only by durable ID`, () => {
    const first = form(file); first.click('saveBOM');
    const next = form(file === 'html/Form.html' ? 'html/FormTable.html' : 'html/Form.html', first.storage);
    expect(next.elements.projectDocumentID.value).toBe('9'); expect(next.elements.operationID.value).toBe(first.calls[0].payload.operationID);
    next.elements.projectDocumentID.value = 'different'; next.click('resumeBOM'); expect(next.calls[0]).toMatchObject({ method: 'resumeBOM', payload: first.calls[0].payload.operationID });
  });
  it(`${file}: changed input requires explicit new operation, never automatic timeout regeneration`, () => {
    const ui = form(file); ui.click('saveBOM'); ui.calls[0].failure({ message: 'timeout' });
    const id = ui.elements.operationID.value; ui.elements.specification.value += '\nextra'; ui.click('saveBOM'); expect(ui.calls).toHaveLength(1);
    ui.click('newBOM'); ui.click('saveBOM'); expect(ui.calls[1].payload.operationID).not.toBe(id); expect(ui.elements.operationHistory.textContent).toContain(id);
  });
  it.each(['COMMITTED','ALREADY_APPLIED','VALIDATION_ERROR','RECOVERY_REQUIRED','CONFLICT'])(`${file}: renders %s correctly`, status => {
    const ui = form(file); ui.click('saveBOM'); ui.calls[0].success({ status, operationID: ui.calls[0].payload.operationID, diagnostics: [{ sourceRowIndex: 2, message: 'Missing Part' }] });
    const text = ui.elements.bomStatus.textContent;
    expect(text).toContain('OperationID'); expect(text).toContain('Рядок 3: Missing Part');
    expect(ui.elements.saveBOM.disabled).toBe(status === 'CONFLICT');
    if (status === 'COMMITTED') expect(text).toContain('успішно');
    if (status === 'VALIDATION_ERROR') expect(text).toContain('не підтверджене');
    if (status === 'RECOVERY_REQUIRED') expect(text).toContain('відновлення');
  });
  it(`${file}: denied storage still displays ID and allows manual recovery after reopen`, () => {
    const ui = form(file, undefined, true); ui.click('saveBOM'); const id = ui.elements.operationID.value;
    expect(ui.elements.storageWarning.textContent).toContain('недоступне');
    const reopened = form(file, undefined, true); reopened.elements.operationID.value = id; reopened.click('resumeBOM'); expect(reopened.calls[0].payload).toBe(id);
  });
  it(`${file}: ignores late callback from an explicitly abandoned operation`, () => {
    const ui = form(file); ui.click('saveBOM'); const old = ui.calls[0]; ui.timeout(); ui.click('newBOM'); ui.click('saveBOM');
    old.success({ status: 'COMMITTED', operationID: old.payload.operationID }); expect(ui.elements.operationID.value).toBe(ui.calls[1].payload.operationID); expect(ui.elements.saveBOM.disabled).toBe(true);
  });
  it(`${file}: does not accept Prepare success as saved BOM`, () => {
    const ui = form(file); ui.click('saveBOM'); ui.calls[0].success({ ok: true }); expect(ui.elements.bomStatus.textContent).toContain('Непідтверджена');
  });
  it(`${file}: explicit original-input retry with a manually saved ID never regenerates ID`, () => {
    const ui = form(file, undefined, true); ui.elements.operationID.value = 'BOM_saved'; ui.elements.projectDocumentID.listeners.input();
    ui.click('saveBOM'); expect(ui.calls[0].payload.operationID).toBe('BOM_saved');
  });
}
