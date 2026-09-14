/**
 * ==========================================================
 * ERP КУБ
 * Module: Manufacturing Synchronization
 * Layer: Application / Types
 * File: manufacturing-synchronization-analysis.ts
 * Path: src/modules/manufacturingSync/types/manufacturing-synchronization-analysis.ts
 *
 * Результат аналізу одного Manufacturing-запису перед
 * виконанням синхронізації з Placement.
 * ==========================================================
 */

import { Manufacturing } from '../../../domain/manufacturing/manufacturing.model';
import { ManufacturingSyncState } from '../../../domain/manufacturing-sync/manufacturing-sync-state.model';
import { Placement } from '../../../domain/placement/placement.model';
import { ManufacturingSynchronizationAction } from './manufacturing-synchronization-action';
import { ManufacturingSynchronizationStatus } from './manufacturing-synchronization-status';

export interface ManufacturingSynchronizationAnalysis {
  manufacturing: Readonly<Manufacturing>;
  syncState: Readonly<ManufacturingSyncState> | null;
  status: ManufacturingSynchronizationStatus;
  action: ManufacturingSynchronizationAction;
  placement?: Readonly<Placement>;
  message?: string;
}
