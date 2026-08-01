/**
 * ==========================================================
 * ERP КУБ
 * Module: ShiftPlanItem
 * File: GoogleSheetsShiftPlanItemDataSource.ts
 * Path: src\infrastructure\sheets\shift-plan-item\GoogleSheetsShiftPlanItemDataSource.ts
 *
 * DataSource таблиці 15_ShiftPlanItems.
 * ==========================================================
 */
import { GoogleSheetsDataSource } from '../GoogleSheetsDataSource';
import { SheetKey } from '../SheetKey';
import { SheetProvider } from '../SheetProvider';

import { SHIFT_PLAN_ITEMS_HEADERS } from '../../../modules/shift-plan-item/shift-plan-item.headers';
import { ShiftPlanItemRow } from '../../../modules/shift-plan-item/shift-plan-item.row';

export class GoogleSheetsShiftPlanItemDataSource extends GoogleSheetsDataSource<ShiftPlanItemRow> {
  constructor(sheetProvider: SheetProvider) {
    super(sheetProvider, SheetKey.SHIFT_PLAN_ITEMS, SHIFT_PLAN_ITEMS_HEADERS);
  }
}
