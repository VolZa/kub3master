// src/infrastructure/sheets/shiftPlan/GoogleSheetsShiftPlanDataSource.ts

import { GoogleSheetsDataSource } from '../GoogleSheetsDataSource';
import { SheetKey } from '../SheetKey';
import { SheetProvider } from '../SheetProvider';

export class GoogleSheetsShiftPlanDataSource extends GoogleSheetsDataSource {
  constructor(sheetProvider: SheetProvider) {
    super(sheetProvider, SheetKey.SHIFT_PLANS);
  }
}
