import { ProductionImportService } from '../../modules/productionImport/production-import.service';

import { GoogleSheetsProductionDataSource } from '../../infrastructure/sheets/production/GoogleSheetsProductionDataSource';

import { sheetProvider } from './infrastructure.factory';

let service: ProductionImportService | null = null;

export function getProductionImportService(): ProductionImportService {
  if (!service) {
    service = new ProductionImportService(
      new GoogleSheetsProductionDataSource(sheetProvider),
    );
  }

  return service;
}
