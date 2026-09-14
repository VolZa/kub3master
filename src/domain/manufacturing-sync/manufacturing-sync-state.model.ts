/**
 * ==========================================================
 * ERP КУБ
 * Module: Manufacturing Synchronization
 * File: manufacturing-sync-state.model.ts
 * Path: src/domain/manufacturing-sync/manufacturing-sync-state.model.ts
 *
 * Останній успішно синхронізований стан Manufacturing.
 * ==========================================================
 */

import { ManufacturingSyncStatus } from './manufacturing-sync-status';

export interface ManufacturingSyncState {
  manufacturingId: string;
  placementId?: number;
  status: ManufacturingSyncStatus;
  sourceUpdatedAt: Date;
  updatedAt: Date;
}
