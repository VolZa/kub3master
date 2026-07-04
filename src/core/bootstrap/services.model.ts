// src/core/bootstrap/services.model.ts

import { BOMExplorerService } from '../../modules/bom/services/bom-explorer.service';
import { BOMMaterialsService } from '../../modules/bom/services/bom-materials.service';

import { ProductReportDataService } from '../../modules/reports/services/product-report-data.service';
import { SheetReportRowBuilder } from '../../modules/reports/services/sheet-report-row-builder.service';
import { GoogleSheetsReportWriter } from '../../modules/reports/services/google-sheets-report-writer.service';

export interface Services {
  bom: {
    explorer: BOMExplorerService;
    materials: BOMMaterialsService;
  };

  reports: {
    productData: ProductReportDataService;
    rowBuilder: SheetReportRowBuilder;
    writer: GoogleSheetsReportWriter;
  };
}
