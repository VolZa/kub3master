// src/infrastructure/sheets/production/GoogleSheetsProductionDataSource.ts

import { GoogleSheetsDataSource } from '../GoogleSheetsDataSource';
import { SheetKey } from '../SheetKey';
import { SheetProvider } from '../SheetProvider';

export class GoogleSheetsProductionDataSource extends GoogleSheetsDataSource {
  constructor(sheetProvider: SheetProvider) {
    super(sheetProvider, SheetKey.PRODUCTION);
  }
}
