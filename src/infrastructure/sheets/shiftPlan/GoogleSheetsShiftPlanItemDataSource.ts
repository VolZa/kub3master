// src/infrastructure/sheets/shiftPlan/GoogleSheetsShiftPlanItemDataSource.ts

import { GoogleSheetsDataSource } from '../GoogleSheetsDataSource';
import { SheetKey } from '../SheetKey';
import { SheetProvider } from '../SheetProvider';

export class GoogleSheetsShiftPlanItemDataSource extends GoogleSheetsDataSource {
  constructor(sheetProvider: SheetProvider) {
    super(sheetProvider, SheetKey.SHIFT_PLAN_ITEMS);
  }
}
