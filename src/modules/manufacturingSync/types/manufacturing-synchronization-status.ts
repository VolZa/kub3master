/**
 * ==========================================================
 * ERP КУБ
 * Module: Manufacturing Synchronization
 * File: manufacturing-synchronization-status.ts
 * Path: src/modules/manufacturing-sync/types/manufacturing-synchronization-status.ts
 *
 * Результат аналізу запису Manufacturing перед синхронізацією.
 * ==========================================================
 */

export const MANUFACTURING_SYNCHRONIZATION_STATUSES = [
  'READY',
  'NO_PLACEMENT',
  'CANCELLED',
  'PLACEMENT_NOT_FOUND',
  'PLACEMENT_HOUSE_MISMATCH',
  'PLACEMENT_PRODUCT_MISMATCH',
  'INVALID_QUANTITY_FOR_PLACEMENT',
] as const;

export type ManufacturingSynchronizationStatus =
  (typeof MANUFACTURING_SYNCHRONIZATION_STATUSES)[number];
