export interface ProductReportItem {
  materialId: string;

  materialCode: string;
  materialName: string;

  reportGroup: string;
  reportColumn: string;

  qty: number;
  unit: string;

  sort: number;
}
