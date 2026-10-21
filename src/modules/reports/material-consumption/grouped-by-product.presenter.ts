import type { MaterialConsumptionReportDataset, ProductReportGroup, ReportPresenter } from './material-consumption-report.dto';

export interface GroupedByProductView {
  dateFrom?: string;
  dateTo?: string;
  groups: { productId: string; productCode: string; productName: string; productQty: number;
    rows: ProductReportGroup['materials'] }[];
}
export class GroupedByProductPresenter implements ReportPresenter<GroupedByProductView> {
  present(dataset: MaterialConsumptionReportDataset): GroupedByProductView {
    const display = (date?: string) => date?.split('-').reverse().join('-');
    return { dateFrom: display(dataset.period.dateFrom), dateTo: display(dataset.period.dateTo),
      groups: dataset.products.map(p => ({ productId: p.productId, productCode: p.productCode,
        productName: p.productName, productQty: p.productQty, rows: p.materials.map(m => ({ ...m })) })) };
  }
}
