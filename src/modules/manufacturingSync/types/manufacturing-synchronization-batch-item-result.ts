/**
 * ==========================================================
 * ERP КУБ
 * Module: Manufacturing Synchronization
 * File: manufacturing-synchronization-batch-item-result.ts
 * Path: src/modules/manufacturingSync/types/manufacturing-synchronization-batch-item-result.ts
 *
 * Призначення:
 * Результат обробки одного Manufacturing у batch-синхронізації.
 * ==========================================================
 */

import { ManufacturingSynchronizationResult } from './manufacturing-synchronization-result';

export interface ManufacturingSynchronizationBatchItemResult {
  manufacturingId: string;

  status: 'EXECUTED' | 'SKIPPED' | 'ERROR';

  result?: ManufacturingSynchronizationResult;

  error?: string;
}
