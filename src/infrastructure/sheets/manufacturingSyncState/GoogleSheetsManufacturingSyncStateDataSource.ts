/**
 * ==========================================================
 * ERP КУБ
 * Module: Manufacturing Synchronization
 * File: GoogleSheetsManufacturingSyncStateDataSource.ts
 * Path: src/infrastructure/sheets/manufacturingSyncState/GoogleSheetsManufacturingSyncStateDataSource.ts
 *
 * DataSource таблиці ManufacturingSyncState.
 * ==========================================================
 */

import { GoogleSheetsDataSource } from '../GoogleSheetsDataSource';
import { SheetKey } from '../SheetKey';
import { SheetProvider } from '../SheetProvider';

import { MANUFACTURING_SYNC_STATE_HEADERS } from './manufacturingSyncState.headers';
import { ManufacturingSyncStateRow } from './manufacturingSyncState.row';

export class GoogleSheetsManufacturingSyncStateDataSource extends GoogleSheetsDataSource<ManufacturingSyncStateRow> {
  constructor(sheetProvider: SheetProvider) {
    super(
      sheetProvider,
      SheetKey.MANUFACTURING_SYNC_STATE,
      MANUFACTURING_SYNC_STATE_HEADERS,
    );
  }
}
