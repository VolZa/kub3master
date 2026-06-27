import { ReportCell } from './report-cell.model';

export interface ProductMatrix {
  productCode: string;
  productName: string;

  cells: ReportCell[];
}
