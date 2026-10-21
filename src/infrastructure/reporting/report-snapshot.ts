import type { MaterialConsumptionReportDataset, MaterialConsumptionReportRequest } from '../../modules/reports/material-consumption/material-consumption-report.dto';
export const SNAPSHOT_KEY = 'KUB_MATERIAL_REPORT_V1';
export interface ReportSnapshot {
  schema: 1;
  reportType: 'material-consumption';
  method: 'normative';
  bomBasis: 'CURRENT_BOM';
  generatedDate: string;
  filters: { houseCode?: string; productCode?: string; dateFrom?: string; dateTo?: string };
  lossPercents: { rebar: number; rolled: number; concrete: number };
  manufacturingIds: string[];
}
export function reportSnapshot(dataset: MaterialConsumptionReportDataset, request: MaterialConsumptionReportRequest, generatedDate: string): ReportSnapshot {
  return { schema: 1, reportType: 'material-consumption', method: 'normative', bomBasis: dataset.bomBasis, generatedDate,
    filters: { houseCode: request.houseCode, productCode: request.productCode, dateFrom: request.dateFrom, dateTo: request.dateTo },
    lossPercents: { ...request.lossPercents }, manufacturingIds: dataset.products.flatMap(p => p.manufacturingIds) };
}
