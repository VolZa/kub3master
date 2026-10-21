import { expect, it, vi } from 'vitest';
import { runMaterialReportWeb, validateMaterialReportWebInput } from './material-report-web';

const request = { reportType: 'material-consumption', calculationMethod: 'normative', format: 'google-sheet',
  houseCode: 'H001', productCode: 'П-1', dateFrom: '2026-06-30', lossPercents: { rebar: 7, rolled: 5, concrete: 0 } };
function deps() {
  const generate = vi.fn((_input: unknown): any => ({ status: 'OK', sheetId: 123, url: 'sheet' }));
  return { houseExists: vi.fn(code => code === 'H001'), output: vi.fn(() => ({ generate })), generate };
}
it('validates H001/П-1 and three explicit norms then delegates once to the existing output', () => {
  const d = deps(); expect(runMaterialReportWeb(request, d)).toMatchObject({ status: 'OK', sheetId: 123 });
  expect(d.generate).toHaveBeenCalledExactlyOnceWith(request);
});
it('supports all products of one house and either open period boundary', () => {
  for (const date of [{ dateFrom: '2026-06-30' }, { dateTo: '2026-06-30' }]) {
    const input: any = { ...request, ...date }; delete input.productCode;
    if ('dateTo' in date) delete input.dateFrom;
    const d = deps(); runMaterialReportWeb(input, d);
    expect(d.generate.mock.calls[0][0]).not.toHaveProperty('productCode');
    expect(d.generate.mock.calls[0][0]).toMatchObject(date);
  }
});
it.each(['rebar', 'rolled', 'concrete'])('rejects empty/missing/invalid %s before constructing output', key => {
  for (const value of ['', undefined, null, '7', -1, 101, NaN, Infinity]) {
    const d = deps();
    expect(runMaterialReportWeb({ ...request, lossPercents: { ...request.lossPercents, [key]: value } }, d)).toMatchObject({ status: 'ERROR', code: 'INVALID_LOSS_NORM' });
    expect(d.output).not.toHaveBeenCalled();
  }
});
it('accepts zero, fractions and 100 without coercion', () => {
  expect(validateMaterialReportWebInput({ ...request, lossPercents: { rebar: 0, rolled: 0.125, concrete: 100 } }).lossPercents).toEqual({ rebar: 0, rolled: 0.125, concrete: 100 });
});
it.each(['PRODUCT_NOT_FOUND', 'INCOMPLETE_BOM', 'REPORT_RECOVERY_REQUIRED', 'REPORT_BUSY'])('serializes %s without retry', code => {
  const d = deps(); d.generate.mockImplementation(() => { throw new Error(`${code}: detail`); });
  expect(runMaterialReportWeb(request, d)).toMatchObject({ status: 'ERROR', code });
  expect(d.generate).toHaveBeenCalledTimes(1);
});
it('passes EMPTY without writing a substitute report', () => {
  const d = deps(); d.generate.mockReturnValue({ status: 'EMPTY' });
  expect(runMaterialReportWeb(request, d)).toEqual({ status: 'EMPTY' });
});
it('rejects invalid or nonexistent houses and unsupported method before output', () => {
  for (const input of [{ ...request, houseCode: 12 }, { ...request, houseCode: 'missing' }, { ...request, calculationMethod: 'batch-based' }, { ...request, dateFrom: new Date() }, { ...request, dateFrom: '2026-02-30' }]) {
    const d = deps(); expect(runMaterialReportWeb(input, d)).toMatchObject({ status: 'ERROR' }); expect(d.output).not.toHaveBeenCalled();
  }
});
