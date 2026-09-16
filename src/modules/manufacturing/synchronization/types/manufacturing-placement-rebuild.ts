/**
 * ==========================================================
 * ERP КУБ
 * Module: Manufacturing
 * File: manufacturing-placement-rebuild.ts
 * Path: src\modules\manufacturing\synchronization\types\
 *       manufacturing-placement-rebuild.ts
 *
 * Типи результату повної реконструкції
 * Manufacturing → Placement.
 * ==========================================================
 */

import { PlacementStatus } from '../../../../domain/placement/placement.status';

export type ManufacturingPlacementRebuildMode = 'DRY_RUN' | 'EXECUTE';

export type ManufacturingPlacementRebuildAction =
  | 'NONE'
  | 'MARK_PRODUCED'
  | 'RESET_TO_NONE';

export interface ManufacturingPlacementRebuildChange {
  placementId: number;
  currentStatus: PlacementStatus;
  newStatus: PlacementStatus;
  action: ManufacturingPlacementRebuildAction;

  producedDate?: Date;
  producedShift?: number;
}

export interface ManufacturingPlacementDuplicate {
  placementId: number;
  manufacturingIds: string[];
}

export interface ManufacturingSyncStateRebuildSummary {
  totalManufacturing: number;
  activeManufacturing: number;
  cancelledManufacturing: number;
  withPlacement: number;
  withoutPlacement: number;
  rebuiltRecords: number;
}

export interface ManufacturingPlacementRebuildSummary {
  totalPlacements: number;
  markProduced: number;
  resetToNone: number;
  unchanged: number;
}

export interface ManufacturingPlacementRebuildResult {
  mode: ManufacturingPlacementRebuildMode;
  manufacturing: ManufacturingSyncStateRebuildSummary;
  placements: ManufacturingPlacementRebuildSummary;
  changes: ManufacturingPlacementRebuildChange[];
  duplicatePlacements: ManufacturingPlacementDuplicate[];
  syncStateRecords: ManufacturingSyncStateRebuildRecord[];
}

export interface ManufacturingSyncStateRebuildRecord {
  manufacturingId: string;
  placementId: number | undefined;
  status: 'SYNCED' | 'NO_PLACEMENT' | 'CANCELLED';
}
