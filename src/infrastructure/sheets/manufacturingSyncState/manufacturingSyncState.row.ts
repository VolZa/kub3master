/**
 * ==========================================================
 * ERP КУБ
 * Module: Manufacturing Synchronization
 * File: manufacturingSyncState.row.ts
 * Path: src/infrastructure/sheets/manufacturingSyncState/manufacturingSyncState.row.ts
 *
 * Фізична структура рядка таблиці ManufacturingSyncState.
 * ==========================================================
 */

export interface ManufacturingSyncStateRow {
  ManufacturingId: string;
  PlacementId: number | undefined;
  Status: string;
  SourceUpdatedAt: Date;
  UpdatedAt: Date;
}
