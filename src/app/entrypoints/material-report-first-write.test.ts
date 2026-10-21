import { expect, it } from 'vitest';
import { prepareB2FirstWrite, B2_CONTROL_REQUEST } from './material-report-first-write';
import type { MaterialConsumptionReportDataset } from '../../modules/reports/material-consumption/material-consumption-report.dto';

function fixture(): MaterialConsumptionReportDataset {
  return { timeZone: 'Europe/Kyiv', bomBasis: 'CURRENT_BOM', period: { dateFrom: '2026-06-30', dateTo: '2026-06-30' },
    products: [{ productId: '4000000', productCode: 'П-1', productName: 'Плита П-1', productQty: 1, manufacturingIds: ['М00000075'],
      materials: Array.from({ length: 7 }, (_, i) => ({ stage: 'LOSSES_APPLIED', materialId: String(i), code: String(i), name: 'Material',
        group: 'REBAR', unit: 'кг', baseQty: 1, lossPercent: 7, lossQty: 0.07, totalQty: 1.07 })) }] };
}
it('renders only the fixed approved dataset with a control label and no loss recalculation', () => {
  const result = prepareB2FirstWrite(fixture(), '2026-10-21');
  expect(result.values[0][0]).toContain('КОНТРОЛЬНИЙ ТЕСТ');
  expect(result.materialRowCount).toBe(7);
  expect(result.values[13].slice(2)).toEqual([1, 7, 0.07, 1.07]);
  expect(B2_CONTROL_REQUEST.lossPercents).toEqual({ rebar: 7, rolled: 5, concrete: 0 });
});
it.each(['id', 'qty', 'fact', 'count', 'period', 'empty'])('rejects changed control %s before writer', change => {
  const d = fixture();
  if (change === 'id') d.products[0].productId = 'other';
  if (change === 'qty') d.products[0].productQty = 2;
  if (change === 'fact') d.products[0].manufacturingIds.push('other');
  if (change === 'count') d.products[0].materials.pop();
  if (change === 'period') d.period.dateFrom = '2026-06-29';
  if (change === 'empty') d.products = [];
  expect(() => prepareB2FirstWrite(d, '2026-10-21')).toThrow('CONTROL_DATASET_MISMATCH');
});
