/**
 * ==========================================================
 * ERP КУБ
 * Module: Manufacturing Synchronization
 * File: manufacturing-sync-state-data-source.interface.ts
 * Path: src/infrastructure/sheets/manufacturingSyncState/manufacturing-sync-state-data-source.interface.ts
 *
 * Контракт DataSource для таблиці ManufacturingSyncState.
 * ==========================================================
 */

import { ManufacturingSyncStateRow } from './manufacturingSyncState.row';

export interface IManufacturingSyncStateDataSource {
  getRows(): readonly ManufacturingSyncStateRow[];

  saveRows(rows: readonly ManufacturingSyncStateRow[]): void;
}
