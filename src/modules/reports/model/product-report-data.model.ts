import { ProductReportItem } from './product-report-item.model';

export interface ProductReportData {
  productId: string;
  productCode: string;
  productName: string;

  items: ProductReportItem[];
}
