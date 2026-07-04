// src/core/bootstrap/reports.ts

import { Repositories } from './repositories.model';

import { ProductReportDataService } from '../../modules/reports/services/product-report-data.service';
import { SheetReportRowBuilder } from '../../modules/reports/services/sheet-report-row-builder.service';
import { GoogleSheetsReportWriter } from '../../modules/reports/services/google-sheets-report-writer.service';

export function createReportServices(
  repositories: Repositories,
  bom: {
    explorer: any;
    materials: any;
  },
) {
  const productData = new ProductReportDataService(
    repositories.elements,

    bom.materials,

    repositories.materials,

    repositories.reports.layout,
  );

  const rowBuilder = new SheetReportRowBuilder(repositories.reports.layout);

  const writer = new GoogleSheetsReportWriter();

  return {
    productData,

    rowBuilder,

    writer,
  };
}
