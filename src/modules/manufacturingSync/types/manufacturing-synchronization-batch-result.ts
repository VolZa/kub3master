/**
 * ==========================================================
 * ERP КУБ
 * Module: Manufacturing Synchronization
 * File: manufacturing-synchronization-batch-result.ts
 * Path: src/modules/manufacturingSync/types/manufacturing-synchronization-batch-result.ts
 *
 * Призначення:
 * Агрегований результат пакетної синхронізації Manufacturing.
 * ==========================================================
 */

import { ManufacturingSynchronizationBatchItemResult } from './manufacturing-synchronization-batch-item-result';

export interface ManufacturingSynchronizationBatchResult {
  total: number;
  executed: number;
  skipped: number;
  errors: number;

  results: ManufacturingSynchronizationBatchItemResult[];
}
