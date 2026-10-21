import type { MaterialLossPercents, MaterialLossResult } from '../../../domain/materials/material-loss.model';

export interface MaterialConsumptionReportRequest {
  houseCode?: string;
  productCode?: string;
  dateFrom?: string;
  dateTo?: string;
  lossPercents: MaterialLossPercents;
}
export interface ProductReportGroup {
  productId: string;
  productCode: string;
  productName: string;
  productQty: number;
  manufacturingIds: string[];
  materials: (MaterialLossResult & { code: string; name: string })[];
}
export interface MaterialConsumptionReportDataset {
  timeZone: 'Europe/Kyiv';
  bomBasis: 'CURRENT_BOM';
  period: { dateFrom?: string; dateTo?: string };
  products: ProductReportGroup[];
}

/** Other presentations consume the dataset; a future tree needs separate expansion data.
 * Aggregated materials cannot reconstruct a BOM tree.
 */
export interface ReportPresenter<T> {
  present(dataset: MaterialConsumptionReportDataset): T;
}
