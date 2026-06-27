import { ReportCell } from './report-cell.model';

export interface ProductReportData {
  productCode: string;
  productName: string;

  cells: ReportCell[];
}
