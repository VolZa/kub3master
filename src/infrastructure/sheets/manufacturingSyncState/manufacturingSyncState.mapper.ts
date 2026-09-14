/**
 * ==========================================================
 * ERP КУБ
 * Module: Manufacturing Synchronization
 * File: manufacturingSyncState.mapper.ts
 * Path: src/infrastructure/sheets/manufacturingSyncState/manufacturingSyncState.mapper.ts
 *
 * Перетворення між фізичним Row та Domain-моделлю
 * ManufacturingSyncState.
 * ==========================================================
 */

import { ManufacturingSyncState } from '../../../domain/manufacturing-sync/manufacturing-sync-state.model';

import {
  MANUFACTURING_SYNC_STATUSES,
  ManufacturingSyncStatus,
} from '../../../domain/manufacturing-sync/manufacturing-sync-status';

import { ManufacturingSyncStateRow } from './manufacturingSyncState.row';

export class ManufacturingSyncStateMapper {
  public static mapRowToState(
    row: ManufacturingSyncStateRow,
  ): ManufacturingSyncState {
    return {
      manufacturingId: String(row.ManufacturingId),
      placementId: this.mapPlacementId(row.PlacementId),
      status: this.mapStatus(row.Status),
      sourceUpdatedAt: row.SourceUpdatedAt,
      updatedAt: row.UpdatedAt,
    };
  }

  public static mapStateToRow(
    state: ManufacturingSyncState,
  ): ManufacturingSyncStateRow {
    return {
      ManufacturingId: state.manufacturingId,
      PlacementId: state.placementId,
      Status: state.status,
      SourceUpdatedAt: state.sourceUpdatedAt,
      UpdatedAt: state.updatedAt,
    };
  }

  private static mapPlacementId(value: number | undefined): number | undefined {
    if (value === undefined || value === null) {
      return undefined;
    }

    return Number(value);
  }

  private static mapStatus(value: string): ManufacturingSyncStatus {
    if ((MANUFACTURING_SYNC_STATUSES as readonly string[]).includes(value)) {
      return value as ManufacturingSyncStatus;
    }

    throw new Error(`Unknown ManufacturingSyncState status: "${value}"`);
  }
}
