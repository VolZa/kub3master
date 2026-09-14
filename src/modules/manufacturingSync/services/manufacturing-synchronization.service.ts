/**
 * ==========================================================
 * ERP КУБ
 * Module: Manufacturing Synchronization
 * Layer: Application / Service
 * File: manufacturing-synchronization.service.ts
 * Path: src/modules/manufacturingSync/services/manufacturing-synchronization.service.ts
 *
 * Аналіз та виконання синхронізації Manufacturing з Placement.
 *
 * На етапі analyze() дані не змінюються.
 * ==========================================================
 */

import { Manufacturing } from '../../../domain/manufacturing/manufacturing.model';
import { IManufacturingSyncStateRepository } from '../../../domain/manufacturing-sync/manufacturing-sync-state.repository.interface';

import { IPlacementRepository } from '../../placement/placement.repository.interface';

import { ManufacturingSynchronizationAnalysis } from '../types/manufacturing-synchronization-analysis';
import { IManufacturingSynchronizationService } from '../types/manufacturing-synchronization-service.interface';
import { Placement } from '../../../domain/placement/placement.model';
import { ManufacturingSynchronizationResult } from '../types/manufacturing-synchronization-result';

import { PlacementStatus } from '../../../domain/placement/placement.status';

// import { ManufacturingSynchronizationResult } from '../types/manufacturing-synchronization-result';

export class ManufacturingSynchronizationService implements IManufacturingSynchronizationService {
  constructor(
    private readonly syncStateRepository: IManufacturingSyncStateRepository,
    private readonly placementRepository: IPlacementRepository,
  ) {}

  private executeMarkProduced(
    analysis: Readonly<ManufacturingSynchronizationAnalysis>,
  ): ManufacturingSynchronizationResult {
    if (analysis.action.type !== 'MARK_PRODUCED') {
      throw new Error('executeMarkProduced викликано для іншої дії.');
    }

    const placement = analysis.action.placement;

    const updatedPlacement: Placement = {
      ...placement,
      status: PlacementStatus.PRODUCED,
    };

    this.placementRepository.update(updatedPlacement);

    const now = new Date();

    this.syncStateRepository.upsert({
      manufacturingId: analysis.manufacturing.id,
      placementId: placement.id,
      status: 'SYNCED',
      sourceUpdatedAt: analysis.manufacturing.updatedAt,
      updatedAt: now,
    });

    return {
      manufacturing: analysis.manufacturing,
      status: analysis.status,
      action: analysis.action,
      message:
        `Placement ${placement.id} позначено PRODUCED. ` +
        `Manufacturing ${analysis.manufacturing.id} синхронізовано.`,
    };
  }

  private executeUnmarkProduced(
    analysis: Readonly<ManufacturingSynchronizationAnalysis>,
  ): ManufacturingSynchronizationResult {
    if (analysis.action.type !== 'UNMARK_PRODUCED') {
      throw new Error('executeUnmarkProduced викликано для іншої дії.');
    }

    const placement = analysis.action.placement;

    const updatedPlacement: Placement = {
      ...placement,
      status: PlacementStatus.NONE,
    };

    this.placementRepository.update(updatedPlacement);

    const now = new Date();

    this.syncStateRepository.upsert({
      manufacturingId: analysis.manufacturing.id,
      placementId: placement.id,
      status: 'CANCELLED',
      sourceUpdatedAt: analysis.manufacturing.updatedAt,
      updatedAt: now,
    });

    return {
      manufacturing: analysis.manufacturing,
      status: analysis.status,
      action: analysis.action,
      message:
        `Manufacturing ${analysis.manufacturing.id} скасовано. ` +
        `Placement ${placement.id} повернено у NONE.`,
    };
  }

  private executeMoveProduced(
    analysis: Readonly<ManufacturingSynchronizationAnalysis>,
  ): ManufacturingSynchronizationResult {
    if (analysis.action.type !== 'MOVE_PRODUCED') {
      throw new Error('executeMoveProduced викликано для іншої дії.');
    }

    const fromPlacement = analysis.action.from;
    const toPlacement = analysis.action.to;

    // Старий Placement більше не вважається виготовленим.
    const updatedFromPlacement: Placement = {
      ...fromPlacement,
      status: PlacementStatus.NONE,
    };

    // Новий Placement стає виготовленим.
    const updatedToPlacement: Placement = {
      ...toPlacement,
      status: PlacementStatus.PRODUCED,
    };

    this.placementRepository.update(updatedFromPlacement);
    this.placementRepository.update(updatedToPlacement);

    const now = new Date();

    // Переносимо стан синхронізації на новий Placement.
    this.syncStateRepository.upsert({
      manufacturingId: analysis.manufacturing.id,
      placementId: toPlacement.id,
      status: 'SYNCED',
      sourceUpdatedAt: analysis.manufacturing.updatedAt,
      updatedAt: now,
    });

    return {
      manufacturing: analysis.manufacturing,
      status: analysis.status,
      action: analysis.action,
      message:
        `Manufacturing ${analysis.manufacturing.id} перенесено ` +
        `з Placement ${fromPlacement.id} ` +
        `на Placement ${toPlacement.id}. ` +
        `Placement ${fromPlacement.id} → NONE, ` +
        `Placement ${toPlacement.id} → PRODUCED.`,
    };
  }

  private analyzeActiveWithoutPlacement(
    manufacturing: Readonly<Manufacturing>,
    syncState: ReturnType<
      IManufacturingSyncStateRepository['findByManufacturingId']
    >,
  ): ManufacturingSynchronizationAnalysis {
    if (syncState?.status === 'SYNCED' && syncState.placementId !== undefined) {
      const previousPlacement = this.placementRepository.findById(
        syncState.placementId,
      );

      if (!previousPlacement) {
        return {
          manufacturing,
          syncState,
          status: 'PLACEMENT_NOT_FOUND',
          action: { type: 'NONE' },
          message:
            `Попередній Placement ${syncState.placementId} ` + `не знайдено.`,
        };
      }

      return {
        manufacturing,
        syncState,
        status: 'READY',
        action: {
          type: 'DETACH_PRODUCED',
          placement: previousPlacement,
        },
        placement: previousPlacement,
        message:
          `Manufacturing ${manufacturing.id} більше не має PlacementId. ` +
          `Placement ${previousPlacement.id} потрібно відв'язати.`,
      };
    }

    return {
      manufacturing,
      syncState,
      status: 'NO_PLACEMENT',
      action: { type: 'NONE' },
      message: 'Manufacturing не має PlacementId.',
    };
  }

  private executeDetachProduced(
    analysis: Readonly<ManufacturingSynchronizationAnalysis>,
  ): ManufacturingSynchronizationResult {
    if (analysis.action.type !== 'DETACH_PRODUCED') {
      throw new Error('executeDetachProduced викликано для іншої дії.');
    }

    const placement = analysis.action.placement;

    const updatedPlacement: Placement = {
      ...placement,
      status: PlacementStatus.NONE,
    };

    this.placementRepository.update(updatedPlacement);

    const now = new Date();

    this.syncStateRepository.upsert({
      manufacturingId: analysis.manufacturing.id,
      placementId: placement.id,
      status: 'NO_PLACEMENT',
      sourceUpdatedAt: analysis.manufacturing.updatedAt,
      updatedAt: now,
    });

    return {
      manufacturing: analysis.manufacturing,
      status: analysis.status,
      action: analysis.action,
      message:
        `Manufacturing ${analysis.manufacturing.id} ` +
        `відв'язано від Placement ${placement.id}. ` +
        `Placement ${placement.id} повернено у NONE.`,
    };
  }

  public execute(
    analysis: Readonly<ManufacturingSynchronizationAnalysis>,
  ): ManufacturingSynchronizationResult {
    if (analysis.action.type === 'NONE') {
      return {
        manufacturing: analysis.manufacturing,
        status: analysis.status,
        action: analysis.action,
        message: 'Дія не потрібна.',
      };
    }

    if (analysis.action.type === 'MARK_PRODUCED') {
      return this.executeMarkProduced(analysis);
    }

    if (analysis.action.type === 'UNMARK_PRODUCED') {
      return this.executeUnmarkProduced(analysis);
    }

    if (analysis.action.type === 'DETACH_PRODUCED') {
      return this.executeDetachProduced(analysis);
    }

    if (analysis.action.type === 'MOVE_PRODUCED') {
      return this.executeMoveProduced(analysis);
    }

    throw new Error('Невідома дія синхронізації Manufacturing.');
  }

  public analyze(
    manufacturing: Readonly<Manufacturing>,
  ): ManufacturingSynchronizationAnalysis {
    const syncState = this.syncStateRepository.findByManufacturingId(
      manufacturing.id,
    );

    /*
     * --------------------------------------------------------
     * 1. CANCELLED
     * --------------------------------------------------------
     */

    if (manufacturing.status === 'CANCELLED') {
      return this.analyzeCancelled(manufacturing, syncState);
    }

    /*
     * --------------------------------------------------------
     * 2. ACTIVE без Placement
     * --------------------------------------------------------
     */

    if (manufacturing.placementId === undefined) {
      return this.analyzeActiveWithoutPlacement(manufacturing, syncState);
    }

    /*
     * --------------------------------------------------------
     * 3. Для Placement кількість повинна бути 1
     * --------------------------------------------------------
     */

    if (manufacturing.quantity !== 1) {
      return {
        manufacturing,
        syncState,
        status: 'INVALID_QUANTITY_FOR_PLACEMENT',
        action: {
          type: 'NONE',
        },
        message: 'Manufacturing із PlacementId повинен мати Кількість = 1.',
      };
    }

    /*
     * --------------------------------------------------------
     * 4. Знаходимо Placement
     * --------------------------------------------------------
     */

    const placement = this.placementRepository.findById(
      manufacturing.placementId,
    );

    if (!placement) {
      return {
        manufacturing,
        syncState,
        status: 'PLACEMENT_NOT_FOUND',
        action: {
          type: 'NONE',
        },
        message: `Placement ${manufacturing.placementId} не знайдено.`,
      };
    }

    /*
     * --------------------------------------------------------
     * 5. Перевіряємо будинок
     * --------------------------------------------------------
     */

    if (placement.houseCode !== manufacturing.houseCode) {
      return {
        manufacturing,
        syncState,
        status: 'PLACEMENT_HOUSE_MISMATCH',
        action: {
          type: 'NONE',
        },
        placement,
        message: 'Будинок Manufacturing не відповідає будинку Placement.',
      };
    }

    /*
     * --------------------------------------------------------
     * 6. Перевіряємо код виробу
     * --------------------------------------------------------
     */

    if (placement.productCode !== manufacturing.productCode) {
      return {
        manufacturing,
        syncState,
        status: 'PLACEMENT_PRODUCT_MISMATCH',
        action: {
          type: 'NONE',
        },
        placement,
        message: 'Код виробу Manufacturing не відповідає Placement.',
      };
    }

    /*
     * --------------------------------------------------------
     * 7. ACTIVE + коректний Placement
     * --------------------------------------------------------
     */

    return this.analyzeActive(manufacturing, placement, syncState);
  }

  private analyzeActive(
    manufacturing: Readonly<Manufacturing>,
    placement: Readonly<Placement>,
    syncState: ReturnType<
      IManufacturingSyncStateRepository['findByManufacturingId']
    >,
  ): ManufacturingSynchronizationAnalysis {
    /*
     * Новий Manufacturing.
     *
     * SyncState ще немає.
     */
    if (!syncState) {
      return {
        manufacturing,
        syncState: null,
        status: 'READY',
        action: {
          type: 'MARK_PRODUCED',
          placement,
        },
        placement,
        message: `Placement ${placement.id} потрібно позначити PRODUCED.`,
      };
    }

    /*
     * Manufacturing уже синхронізований
     * саме з цим Placement.
     */
    if (
      syncState.status === 'SYNCED' &&
      syncState.placementId === placement.id
    ) {
      return {
        manufacturing,
        syncState,
        status: 'READY',
        action: {
          type: 'NONE',
        },
        placement,
        message:
          `Manufacturing ${manufacturing.id} вже синхронізований ` +
          `з Placement ${placement.id}.`,
      };
    }

    /*
     * Manufacturing був синхронізований
     * з іншим Placement.
     *
     * Цей випадок поки аналізуємо як перенесення.
     */
    if (
      syncState.status === 'SYNCED' &&
      syncState.placementId !== undefined &&
      syncState.placementId !== placement.id
    ) {
      const previousPlacement = this.placementRepository.findById(
        syncState.placementId,
      );

      if (!previousPlacement) {
        return {
          manufacturing,
          syncState,
          status: 'PLACEMENT_NOT_FOUND',
          action: {
            type: 'NONE',
          },
          placement,
          message: `Попередній Placement ${syncState.placementId} не знайдено.`,
        };
      }

      return {
        manufacturing,
        syncState,
        status: 'READY',
        action: {
          type: 'MOVE_PRODUCED',
          from: previousPlacement,
          to: placement,
        },
        placement,
        message:
          `Manufacturing ${manufacturing.id} перенесено ` +
          `з Placement ${previousPlacement.id} ` +
          `на Placement ${placement.id}.`,
      };
    }

    /*
     * Інші стани SyncState поки трактуємо
     * як необхідність встановити PRODUCED.
     */
    return {
      manufacturing,
      syncState,
      status: 'READY',
      action: {
        type: 'MARK_PRODUCED',
        placement,
      },
      placement,
      message: `Placement ${placement.id} потрібно позначити PRODUCED.`,
    };
  }

  private analyzeCancelled(
    manufacturing: Readonly<Manufacturing>,
    syncState: ReturnType<
      IManufacturingSyncStateRepository['findByManufacturingId']
    >,
  ): ManufacturingSynchronizationAnalysis {
    if (syncState?.status === 'CANCELLED') {
      return {
        manufacturing,
        syncState,
        status: 'CANCELLED',
        action: { type: 'NONE' },
        message: `Manufacturing ${manufacturing.id} вже скасовано та синхронізовано.`,
      };
    }

    if (!syncState || syncState.placementId === undefined) {
      return {
        manufacturing,
        syncState,
        status: 'CANCELLED',
        action: { type: 'NONE' },
        message: 'Manufacturing скасовано. Синхронізація не потрібна.',
      };
    }

    /*
     * Знаходимо Placement, який був синхронізований
     * із цим Manufacturing.
     */
    const placement = this.placementRepository.findById(syncState.placementId);

    if (!placement) {
      return {
        manufacturing,
        syncState,
        status: 'PLACEMENT_NOT_FOUND',
        action: {
          type: 'NONE',
        },
        message: `Placement ${syncState.placementId} не знайдено.`,
      };
    }

    return {
      manufacturing,
      syncState,
      status: 'CANCELLED',
      action: {
        type: 'UNMARK_PRODUCED',
        placement,
      },
      placement,
      message:
        `Manufacturing ${manufacturing.id} скасовано. ` +
        `Placement ${placement.id} потрібно повернути у NONE.`,
    };
  }
}
