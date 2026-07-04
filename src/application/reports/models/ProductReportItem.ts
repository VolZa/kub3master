export interface ProductReportItem {
  productId: string;
  productCode: string;
  productName: string;

  plannedQty: number;
  producedQty: number;
  remainingQty: number;
}
