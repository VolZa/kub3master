/**
 * ==========================================================
 * ERP КУБ
 * Module: Manufacturing Synchronization
 * File: manufacturing-sync-status.ts
 * Path: src/domain/manufacturing-sync/manufacturing-sync-status.ts
 *
 * Статуси останнього успішного стану синхронізації
 * Manufacturing.
 * ==========================================================
 */

export const MANUFACTURING_SYNC_STATUSES = [
  'SYNCED',
  'NO_PLACEMENT',
  'CANCELLED',
] as const;

export type ManufacturingSyncStatus =
  (typeof MANUFACTURING_SYNC_STATUSES)[number];
