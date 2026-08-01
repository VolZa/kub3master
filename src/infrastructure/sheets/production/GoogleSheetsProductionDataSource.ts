/**
 * ==========================================================
 * ERP КУБ
 * Module: Production
 * File: GoogleSheetsProductionDataSource.ts
 * Path: src\infrastructure\sheets\production\GoogleSheetsProductionDataSource.ts
 *
 * DataSource таблиці 01_Виготовлення.
 * ==========================================================
 */
import { GoogleSheetsDataSource } from '../GoogleSheetsDataSource';
import { SheetKey } from '../SheetKey';
import { SheetProvider } from '../SheetProvider';

import { PRODUCTION_HEADERS } from '../../../modules/production/production.headers';
import { ProductionRow } from '../../../modules/production/production.row';

export class GoogleSheetsProductionDataSource extends GoogleSheetsDataSource<ProductionRow> {
  constructor(sheetProvider: SheetProvider) {
    super(sheetProvider, SheetKey.PRODUCTION, PRODUCTION_HEADERS);
  }
}
