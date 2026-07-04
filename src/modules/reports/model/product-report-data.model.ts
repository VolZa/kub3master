import { ProductReportItem } from './product-report-item.model';

// export interface ProductReportItem {
//   materialId: string;
//   materialCode: string;
//   materialName: string;

//   reportGroup: string;
//   reportColumn: string;

//   qty: number;
//   unit: string;

//   sort: number;
// }

export interface ProductReportData {
  productId: string;
  productCode: string;
  productName: string;

  items: ProductReportItem[];
}
