/**
 * ==========================================================
 * ERP КУБ
 * Module: Manufacturing
 * Layer: Application / Synchronization
 * File: manufacturing-placement-rebuilder.ts
 * Path: src\modules\manufacturing\synchronization\
 *       manufacturing-placement-rebuilder.ts
 *
 * Повна реконструкція виробничого стану Placement
 * на основі поточного стану Manufacturing.
 *
 * MFG-RESET-001
 * ==========================================================
 */

import { IManufacturingRepository } from '../manufacturing.repository.interface';
import { IPlacementRepository } from '../../placement/placement.repository.interface';

import {
  ManufacturingPlacementRebuildMode,
  ManufacturingPlacementRebuildResult,
  ManufacturingPlacementRebuildChange,
  ManufacturingSyncStateRebuildSummary,
  ManufacturingPlacementRebuildSummary,
  ManufacturingSyncStateRebuildRecord,
} from './types/manufacturing-placement-rebuild';

import { PlacementStatus } from '../../../domain/placement/placement.status';

import { IManufacturingSyncStateRepository } from '../../../domain/manufacturing-sync/manufacturing-sync-state.repository.interface';

import { ManufacturingSyncState } from '../../../domain/manufacturing-sync/manufacturing-sync-state.model';
import { ManufacturingSyncStatus } from '../../../domain/manufacturing-sync/manufacturing-sync-status';

export class ManufacturingPlacementRebuilder {
  constructor(
    private readonly manufacturingRepository: IManufacturingRepository,
    private readonly placementRepository: IPlacementRepository,
    private readonly manufacturingSyncStateRepository: IManufacturingSyncStateRepository,
  ) {}

  public execute(result: ManufacturingPlacementRebuildResult): void {
    if (result.mode !== 'EXECUTE') {
      throw new Error(
        'ManufacturingPlacementRebuilder.execute() потребує режим EXECUTE.',
      );
    }

    for (const change of result.changes) {
      const placement = this.placementRepository.findById(change.placementId);

      if (!placement) {
        throw new Error(`Placement ${change.placementId} not found.`);
      }

      this.placementRepository.update({
        ...placement,

        status: change.newStatus,

        producedDate: change.producedDate,
        producedShift: change.producedShift,
      });
    }

    if (result.changes.length > 0) {
      this.placementRepository.save();
    }

    const manufacturing = this.manufacturingRepository.getAll();
    const updatedAt = new Date();

    const syncStates: ManufacturingSyncState[] = manufacturing.map((item) => {
      let status: ManufacturingSyncStatus;

      if (item.status === 'CANCELLED') {
        status = 'CANCELLED';
      } else if (item.placementId === undefined) {
        status = 'NO_PLACEMENT';
      } else {
        status = 'SYNCED';
      }

      return {
        manufacturingId: item.id,
        placementId: item.placementId,
        status,
        sourceUpdatedAt: item.updatedAt,
        updatedAt,
      };
    });

    this.manufacturingSyncStateRepository.replaceAll(syncStates);
    this.manufacturingSyncStateRepository.save();
  }

  public analyze(
    mode: ManufacturingPlacementRebuildMode = 'DRY_RUN',
  ): ManufacturingPlacementRebuildResult {
    const manufacturing = this.manufacturingRepository.getAll();
    const placements = this.placementRepository.getAll();

    const manufacturingByPlacement = new Map<number, string[]>();

    for (const item of manufacturing) {
      if (item.status !== 'ACTIVE' || item.placementId === undefined) {
        continue;
      }

      const manufacturingIds =
        manufacturingByPlacement.get(item.placementId) ?? [];

      manufacturingIds.push(item.id);

      manufacturingByPlacement.set(item.placementId, manufacturingIds);
    }

    const duplicatePlacements = Array.from(manufacturingByPlacement.entries())
      .filter(([, manufacturingIds]) => manufacturingIds.length > 1)
      .map(([placementId, manufacturingIds]) => ({
        placementId,
        manufacturingIds,
      }));

    const syncStateRecords: ManufacturingSyncStateRebuildRecord[] =
      manufacturing.map((item) => {
        if (item.status === 'CANCELLED') {
          return {
            manufacturingId: item.id,
            placementId: item.placementId,
            status: 'CANCELLED',
          };
        }

        if (item.placementId === undefined) {
          return {
            manufacturingId: item.id,
            placementId: undefined,
            status: 'NO_PLACEMENT',
          };
        }

        return {
          manufacturingId: item.id,
          placementId: item.placementId,
          status: 'SYNCED',
        };
      });

    const producedPlacementIds = new Set<number>(
      manufacturingByPlacement.keys(),
    );

    const activeManufacturing = manufacturing.filter(
      (item) => item.status === 'ACTIVE',
    );

    const cancelledManufacturing = manufacturing.filter(
      (item) => item.status === 'CANCELLED',
    );

    const withPlacement = activeManufacturing.filter(
      (item) => item.placementId !== undefined,
    ).length;

    const withoutPlacement = activeManufacturing.filter(
      (item) => item.placementId === undefined,
    ).length;

    const changes: ManufacturingPlacementRebuildChange[] = [];

    let markProduced = 0;
    let resetToNone = 0;
    let unchanged = 0;

    for (const placement of placements) {
      const hasManufacturing = producedPlacementIds.has(placement.id);

      if (
        hasManufacturing &&
        placement.status !== PlacementStatus.SHIPPED &&
        placement.status !== PlacementStatus.INSTALLED
      ) {
        const manufacturingIds = manufacturingByPlacement.get(placement.id);

        const manufacturingId = manufacturingIds?.[0];

        if (!manufacturingId) {
          throw new Error(
            `Не знайдено Manufacturing для Placement ${placement.id}.`,
          );
        }

        const manufacturingItem = manufacturing.find(
          (item) => item.id === manufacturingId,
        );

        if (!manufacturingItem) {
          throw new Error(`Manufacturing ${manufacturingId} не знайдено.`);
        }

        const producedShift = Number(manufacturingItem.shift);

        if (!Number.isFinite(producedShift)) {
          throw new Error(
            `Некоректна зміна Manufacturing ${manufacturingItem.id}: ${manufacturingItem.shift}`,
          );
        }

        const statusChanged = placement.status !== PlacementStatus.PRODUCED;

        const producedDateChanged =
          placement.producedDate?.getTime() !==
          manufacturingItem.date.getTime();

        const producedShiftChanged = placement.producedShift !== producedShift;

        if (statusChanged || producedDateChanged || producedShiftChanged) {
          changes.push({
            placementId: placement.id,
            currentStatus: placement.status,
            newStatus: PlacementStatus.PRODUCED,
            action: 'MARK_PRODUCED',

            producedDate: manufacturingItem.date,
            producedShift,
          });

          markProduced++;
        } else {
          unchanged++;
        }

        continue;
      }

      if (
        !hasManufacturing &&
        (placement.status === PlacementStatus.NONE ||
          placement.status === PlacementStatus.SCHEDULED ||
          placement.status === PlacementStatus.PRODUCED ||
          placement.status === PlacementStatus.REJECTED)
      ) {
        if (
          placement.status !== PlacementStatus.NONE ||
          placement.producedDate !== undefined ||
          placement.producedShift !== undefined
        ) {
          changes.push({
            placementId: placement.id,
            currentStatus: placement.status,
            newStatus: PlacementStatus.NONE,
            action: 'RESET_TO_NONE',

            producedDate: undefined,
            producedShift: undefined,
          });

          resetToNone++;
        } else {
          unchanged++;
        }

        continue;
      }

      unchanged++;
    }

    const manufacturingSummary: ManufacturingSyncStateRebuildSummary = {
      totalManufacturing: manufacturing.length,
      activeManufacturing: activeManufacturing.length,
      cancelledManufacturing: cancelledManufacturing.length,
      withPlacement,
      withoutPlacement,
      rebuiltRecords: syncStateRecords.length,
    };

    const placementSummary: ManufacturingPlacementRebuildSummary = {
      totalPlacements: placements.length,
      markProduced,
      resetToNone,
      unchanged,
    };

    return {
      mode,
      manufacturing: manufacturingSummary,
      placements: placementSummary,
      changes,
      duplicatePlacements,
      syncStateRecords,
    };
  }
}
