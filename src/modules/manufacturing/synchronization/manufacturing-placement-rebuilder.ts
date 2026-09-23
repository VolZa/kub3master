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

function getManufacturingNumericId(id: string): number {
  const match = id.match(/^М(\d+)$/);

  if (!match) {
    throw new Error(`Invalid Manufacturing ID: ${id}`);
  }

  return Number(match[1]);
}

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

    // 🔎 MFG-RECOVERY-001: DRY RUN реконструкції Placement
    if (duplicatePlacements.length > 0) {
      Logger.log('=== PROPOSED MANUFACTURING PLACEMENT REBUILD ===');

      // Копія стану зайнятих Placement.
      // Вона змінюється тільки в пам'яті під час моделювання.
      const simulatedOccupiedPlacementIds = new Set<number>(
        manufacturingByPlacement.keys(),
      );

      for (const duplicate of duplicatePlacements) {
        // Перший Manufacturing залишаємо на поточному Placement.
        const sortedManufacturingIds = [...duplicate.manufacturingIds].sort(
          (a, b) => getManufacturingNumericId(a) - getManufacturingNumericId(b),
        );

        const [firstManufacturingId, ...conflictingManufacturingIds] =
          sortedManufacturingIds;

        Logger.log(
          `Placement ${duplicate.placementId}: ` +
            `first=${firstManufacturingId}`,
        );

        for (const manufacturingId of conflictingManufacturingIds) {
          const manufacturingItem = manufacturing.find(
            (item) => item.id === manufacturingId,
          );

          if (!manufacturingItem) {
            Logger.log(`  ❌ Manufacturing ${manufacturingId} не знайдено`);
            continue;
          }

          const candidate = placements
            .filter(
              (placement) =>
                placement.houseCode === manufacturingItem.houseCode &&
                placement.productCode === manufacturingItem.productCode &&
                placement.status === PlacementStatus.NONE &&
                !simulatedOccupiedPlacementIds.has(placement.id),
            )
            .sort((a, b) => {
              // більший пріоритет — першим
              if (b.priority !== a.priority) {
                return b.priority - a.priority;
              }

              // нижчий поверх — першим
              if (a.location.floor !== b.location.floor) {
                return a.location.floor - b.location.floor;
              }

              // стабільне сортування
              return a.id - b.id;
            })[0];

          if (!candidate) {
            Logger.log(
              `  🔓 ${manufacturingId}: ` +
                `current=${duplicate.placementId} → ` +
                `DETACH_MANUFACTURING`,
            );

            Logger.log(
              `     house=${manufacturingItem.houseCode}, ` +
                `product=${manufacturingItem.productCode}`,
            );

            Logger.log(
              `     Placement ${duplicate.placementId} ` +
                `залишається зайнятим ${firstManufacturingId}`,
            );

            Logger.log(`  📝 EXECUTION PLAN | ${manufacturingId}`);

            Logger.log(
              `     Manufacturing: ` +
                `Placement ${manufacturingItem.placementId} → NONE`,
            );

            Logger.log(
              `     Status: ${manufacturingItem.status} → ${manufacturingItem.status}`,
            );

            Logger.log(
              `     House: ${manufacturingItem.houseCode} → ${manufacturingItem.houseCode}`,
            );

            Logger.log(
              `     Placement ${duplicate.placementId}: ` +
                `PRODUCED → PRODUCED ` +
                `(залишається за ${firstManufacturingId})`,
            );

            continue;
          }

          Logger.log(`  📝 EXECUTION PLAN | ${manufacturingId}`);

          Logger.log(
            `     Manufacturing: ` +
              `Placement ${manufacturingItem.placementId} → ${candidate.id}`,
          );

          Logger.log(
            `     Status: ${manufacturingItem.status} → ${manufacturingItem.status}`,
          );

          Logger.log(
            `     House: ${manufacturingItem.houseCode} → ${manufacturingItem.houseCode}`,
          );

          Logger.log(
            `     Placement ${duplicate.placementId}: ` +
              `залишається PRODUCED за ${firstManufacturingId}`,
          );

          Logger.log(`     Placement ${candidate.id}: ` + `NONE → PRODUCED`);

          const currentPlacement = placements.find(
            (placement) => placement.id === duplicate.placementId,
          );

          Logger.log(
            `\n🔎 ${manufacturingId} | ` +
              `${manufacturingItem.houseCode} | ` +
              `${manufacturingItem.productCode}`,
          );

          if (currentPlacement) {
            Logger.log(
              `  CURRENT  Placement ${currentPlacement.id}: ` +
                `section=${currentPlacement.location.section}, ` +
                `floor=${currentPlacement.location.floor}, ` +
                `axis=${currentPlacement.location.axis}`,
            );
          }

          Logger.log(
            `  PROPOSED Placement ${candidate.id}: ` +
              `section=${candidate.location.section}, ` +
              `floor=${candidate.location.floor}, ` +
              `axis=${candidate.location.axis}`,
          );

          simulatedOccupiedPlacementIds.add(candidate.id);

          Logger.log(
            `  ${manufacturingId}: ` +
              `current=${duplicate.placementId} → ` +
              `proposed=${candidate.id}`,
          );
        }
      }

      Logger.log('=== END PROPOSED MANUFACTURING PLACEMENT REBUILD ===');
    }

    // 🔎 Діагностика кандидатів для відновлення дубльованих Placement
    // if (duplicatePlacements.length > 0) {
    //   Logger.log('=== DUPLICATE PLACEMENT CANDIDATES ===');

    //   // Placement, які вже зайняті ACTIVE Manufacturing
    //   const occupiedPlacementIds = new Set<number>(
    //     manufacturingByPlacement.keys(),
    //   );

    //   for (const duplicate of duplicatePlacements) {
    //     Logger.log(
    //       `PlacementId=${duplicate.placementId} ` +
    //         `ManufacturingIds=${duplicate.manufacturingIds.join(', ')}`,
    //     );

    //     for (const manufacturingId of duplicate.manufacturingIds) {
    //       const manufacturingItem = manufacturing.find(
    //         (item) => item.id === manufacturingId,
    //       );

    //       if (!manufacturingItem) {
    //         Logger.log(`  ❌ Manufacturing ${manufacturingId} не знайдено`);
    //         continue;
    //       }

    //       const candidates = placements
    //         .filter(
    //           (placement) =>
    //             placement.houseCode === manufacturingItem.houseCode &&
    //             placement.productCode === manufacturingItem.productCode &&
    //             placement.status === PlacementStatus.NONE &&
    //             !occupiedPlacementIds.has(placement.id),
    //         )
    //         .sort((a, b) => a.id - b.id);

    //       Logger.log(
    //         `  ${manufacturingItem.id} | ` +
    //           `Дата=${manufacturingItem.date.toLocaleDateString('uk-UA')} | ` +
    //           `Будинок=${manufacturingItem.houseCode} | ` +
    //           `Виріб=${manufacturingItem.productCode}`,
    //       );

    //       if (candidates.length === 0) {
    //         Logger.log('    Кандидатів немає.');
    //       } else {
    //         Logger.log(
    //           `    Кандидати (${candidates.length}): ` +
    //             candidates
    //               .map(
    //                 (p) =>
    //                   `${p.id} ` +
    //                   `[секція=${p.location.section}, ` +
    //                   `поверх=${p.location.floor}]`,
    //               )
    //               .join('; '),
    //         );
    //       }
    //     }
    //   }

    //   Logger.log('=== END DUPLICATE PLACEMENT CANDIDATES ===');
    // }

    // 🔎 Діагностика повторних PlacementId
    // if (duplicatePlacements.length > 0) {
    //   Logger.log('=== DUPLICATE PLACEMENTS ===');

    //   for (const duplicate of duplicatePlacements) {
    //     Logger.log(
    //       `PlacementId=${duplicate.placementId} ` +
    //         `ManufacturingIds=${duplicate.manufacturingIds.join(', ')}`,
    //     );

    //     for (const manufacturingId of duplicate.manufacturingIds) {
    //       const item = manufacturing.find((m) => m.id === manufacturingId);

    //       if (!item) {
    //         Logger.log(`  ❌ Manufacturing ${manufacturingId} не знайдено`);
    //         continue;
    //       }

    //       Logger.log(
    //         `  ${item.id} | ` +
    //           `Дата=${item.date.toLocaleDateString('uk-UA')} | ` +
    //           `Зміна=${item.shift} | ` +
    //           `Будинок=${item.houseCode || '—'} | ` +
    //           `Виріб=${item.productCode} | ` +
    //           `Кількість=${item.quantity} | ` +
    //           `Статус=${item.status}`,
    //       );
    //     }
    //   }

    //   Logger.log('=== END DUPLICATE PLACEMENTS ===');
    // }

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
