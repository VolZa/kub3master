/**
 * ==========================================================
 * ERP КУБ
 * Module: ShiftPlan
 * File: GoogleSheetsShiftPlanDataSource.ts
 * Path: src\infrastructure\sheets\shift-plan\GoogleSheetsShiftPlanDataSource.ts
 *
 * DataSource таблиці 14_ShiftPlans.
 * ==========================================================
 */
import { GoogleSheetsDataSource } from '../GoogleSheetsDataSource';
import { SheetKey } from '../SheetKey';
import { SheetProvider } from '../SheetProvider';

import { SHIFT_PLAN_HEADERS } from '../../../modules/shift-plan/shift-plan.headers';
import { ShiftPlanRow } from '../../../modules/shift-plan/shift-plan.row';

export class GoogleSheetsShiftPlanDataSource extends GoogleSheetsDataSource<ShiftPlanRow> {
  constructor(sheetProvider: SheetProvider) {
    super(sheetProvider, SheetKey.SHIFT_PLAN, SHIFT_PLAN_HEADERS);
  }
}
