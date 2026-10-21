import type { MaterialConsumptionReportDataset } from '../../modules/reports/material-consumption/material-consumption-report.dto';
import { GroupedByProductPresenter } from '../../modules/reports/material-consumption/grouped-by-product.presenter';
import { GoogleSheetsGroupedReportRenderer } from '../../infrastructure/reporting/grouped-report-renderer';
import { reportSnapshot } from '../../infrastructure/reporting/report-snapshot';

export const B2_CONTROL_REQUEST = {
  houseCode: 'H001', productCode: 'П-1', dateFrom: '2026-06-30', dateTo: '2026-06-30',
  lossPercents: { rebar: 7, rolled: 5, concrete: 0 },
} as const;

export function prepareB2FirstWrite(dataset: MaterialConsumptionReportDataset, today: string) {
  const product = dataset.products[0];
  if (dataset.products.length !== 1 || product.productId !== '4000000' || product.productCode !== 'П-1' ||
    product.productQty !== 1 || product.manufacturingIds.length !== 1 || product.manufacturingIds[0] !== 'М00000075' ||
    product.materials.length !== 7 || dataset.period.dateFrom !== '2026-06-30' || dataset.period.dateTo !== '2026-06-30') {
    throw new Error('CONTROL_DATASET_MISMATCH: no write allowed');
  }
  const table = new GoogleSheetsGroupedReportRenderer().render(new GroupedByProductPresenter().present(dataset), B2_CONTROL_REQUEST, today);
  table.values[0][0] += ' — КОНТРОЛЬНИЙ ТЕСТ';
  table.snapshot = reportSnapshot(dataset, B2_CONTROL_REQUEST, today);
  table.values[10][0] = 'Тестові нормативи, не затверджені нормативи підприємства';
  return table;
}
