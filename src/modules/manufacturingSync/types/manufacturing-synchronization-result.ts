/**
 * ==========================================================
 * ERP КУБ
 * Module: Manufacturing Synchronization
 * Layer: Application / Types
 * File: manufacturing-synchronization-result.ts
 * Path: src/modules/manufacturing-sync/types/manufacturing-synchronization-result.ts
 *
 * Результат аналізу Manufacturing перед синхронізацією.
 * Можливо видалити, якщо не буде використано в сервісі ManufacturingSynchronizationService.
 * ==========================================================
 */

import { Manufacturing } from '../../../domain/manufacturing/manufacturing.model';

import { ManufacturingSynchronizationStatus } from './manufacturing-synchronization-status';
import { ManufacturingSynchronizationAction } from './manufacturing-synchronization-action';

export interface ManufacturingSynchronizationResult {
  manufacturing: Readonly<Manufacturing>;

  status: ManufacturingSynchronizationStatus;

  action: ManufacturingSynchronizationAction;

  message?: string;
}
