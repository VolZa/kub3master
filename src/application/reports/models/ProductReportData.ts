import { ProductReportItem } from './ProductReportItem';

export interface ProductReportData {
  createdAt: Date;

  items: ProductReportItem[];
}
