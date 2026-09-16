/**
 * ==========================================================
 * ERP КУБ
 * Module: Manufacturing Synchronization
 * File: manufacturing-sync-state.repository.interface.ts
 * Path: src/domain/manufacturing-sync/manufacturing-sync-state.repository.interface.ts
 *
 * Контракт Repository для ManufacturingSyncState.
 * ==========================================================
 */

import { ManufacturingSyncState } from './manufacturing-sync-state.model';

export interface IManufacturingSyncStateRepository {
  getAll(): ManufacturingSyncState[];

  findByManufacturingId(manufacturingId: string): ManufacturingSyncState | null;

  upsert(state: ManufacturingSyncState): void;

  replaceAll(states: ManufacturingSyncState[]): void;

  save(): void;
}
