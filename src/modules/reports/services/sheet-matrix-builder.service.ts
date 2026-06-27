import { ProductReportData } from '../model/product-report-data.model';
import { SheetRow } from '../model/sheet-row.model';
import { ReportLayoutRepository } from '../repository/report-layout.repository';

export class SheetMatrixBuilder {
  constructor(private readonly reportLayoutRepo: ReportLayoutRepository) {}

  build(report: ProductReportData): SheetRow {
    const columns = this.reportLayoutRepo.getColumns();

    const values: (string | number)[] = [];

    // Перша колонка - код виробу
    values.push(report.productCode);
    // values.push(report.productName);

    // Інші колонки згідно шаблону звіту
    columns.forEach((column) => {
      const item = report.items.find((i) => i.materialId === column.materialId);

      values.push(item ? item.qty : '');
    });

    return {
      values,
    };
  }
}

// import { ProductReportData } from '../model/product-matrix.model';
// import { SheetRow } from '../model/sheet-row.model';
// import { ReportColumnRepository } from '../repository/report-column.repository';

// export class SheetMatrixBuilder {
//   constructor(private readonly reportColumnRepo: ReportColumnRepository) {}

//   build(matrix: ProductReportData): SheetRow {
//     return {
//       values: [],
//     };
//   }
// }
