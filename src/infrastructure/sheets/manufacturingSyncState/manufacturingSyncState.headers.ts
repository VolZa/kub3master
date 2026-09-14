/**
 * ==========================================================
 * ERP КУБ
 * Module: Manufacturing Synchronization
 * File: manufacturingSyncState.headers.ts
 * Path: src/infrastructure/sheets/manufacturingSyncState/manufacturingSyncState.headers.ts
 *
 * Очікувані заголовки таблиці ManufacturingSyncState.
 * ==========================================================
 */

export const MANUFACTURING_SYNC_STATE_HEADERS = [
  'ManufacturingId',
  'PlacementId',
  'Status',
  'SourceUpdatedAt',
  'UpdatedAt',
] as const;
