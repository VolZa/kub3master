// src/modules/reports/services/sheet-matrix-builder.service.ts

import { ProductReportData } from '../model/product-report-data.model';
import { SheetRow } from '../model/sheet-row.model';
import { ReportLayoutRepository } from '../repository/report-layout.repository';

export class SheetReportRowBuilder {
  constructor(private readonly reportLayoutRepo: ReportLayoutRepository) {}

  build(report: ProductReportData): SheetRow {
    const columns = this.reportLayoutRepo.getColumns();

    const values: (string | number)[] = [];

    // Перша колонка
    values.push(report.productCode);

    // Колонки матеріалів
    columns.forEach((column) => {
      const item = report.items.find((i) => i.materialId === column.materialId);

      values.push(item ? item.qty : '');
    });

    return { values };
  }
}
