/**
 * ==========================================================
 * ERP КУБ
 * Module: Placement
 * File: GoogleSheetsPlacementDataSource.ts
 * Path: src\infrastructure\sheets\placement\GoogleSheetsPlacementDataSource.ts
 *
 * DataSource таблиці 13_Placement.
 * ==========================================================
 */
import { SheetKey } from '../SheetKey';
import { SheetProvider } from '../SheetProvider';
import { GoogleSheetsDataSource } from '../GoogleSheetsDataSource';

import { PLACEMENT_HEADERS } from '../../../modules/placement/placement.headers';
import { PlacementRow } from '../../../modules/placement/placement.row';

export class GoogleSheetsPlacementDataSource extends GoogleSheetsDataSource<PlacementRow> {
  constructor(sheetProvider: SheetProvider) {
    super(sheetProvider, SheetKey.PLACEMENT, PLACEMENT_HEADERS);
  }
}
