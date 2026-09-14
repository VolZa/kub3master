/**
 * ==========================================================
 * ERP КУБ
 * Module: Manufacturing Synchronization
 * File: manufacturing-synchronization-batch-application.service.ts
 * Path: src/modules/manufacturingSync/services/manufacturing-synchronization-batch-application.service.ts
 *
 * Призначення:
 * Пакетний application service для синхронізації Manufacturing.
 *
 * Відповідальність:
 * - пакетний analyze();
 * - пакетний execute();
 * - координація обробки окремих Manufacturing;
 * - підготовка до пакетного збереження.
 * ==========================================================
 */

import { Manufacturing } from '../../../domain/manufacturing/manufacturing.model';

import { IManufacturingSyncStateRepository } from '../../../domain/manufacturing-sync/manufacturing-sync-state.repository.interface';

import { IPlacementRepository } from '../../placement/placement.repository.interface';

import { ManufacturingSynchronizationService } from './manufacturing-synchronization.service';

import { ManufacturingSynchronizationAnalysis } from '../types/manufacturing-synchronization-analysis';

import { ManufacturingSynchronizationBatchItemResult } from '../types/manufacturing-synchronization-batch-item-result';

import { ManufacturingSynchronizationBatchResult } from '../types/manufacturing-synchronization-batch-result';
import { IManufacturingRepository } from 'modules/manufacturing/manufacturing.repository.interface';

export interface ManufacturingSynchronizationBatchAnalysis {
  total: number;
  analyses: ManufacturingSynchronizationAnalysis[];
}

export class ManufacturingSynchronizationBatchApplicationService {
  constructor(
    private readonly synchronizationService: ManufacturingSynchronizationService,
    private readonly placementRepository: IPlacementRepository,
    private readonly syncStateRepository: IManufacturingSyncStateRepository,
    private readonly manufacturingRepository: IManufacturingRepository,
  ) {}

  public analyze(
    manufacturingItems: readonly Manufacturing[],
  ): ManufacturingSynchronizationBatchAnalysis {
    const analyses = manufacturingItems.map((manufacturing) =>
      this.synchronizationService.analyze(manufacturing),
    );

    return {
      total: manufacturingItems.length,
      analyses,
    };
  }

  public execute(
    batchAnalysis: Readonly<ManufacturingSynchronizationBatchAnalysis>,
  ): ManufacturingSynchronizationBatchResult {
    const results: ManufacturingSynchronizationBatchItemResult[] = [];

    let executed = 0;
    let skipped = 0;
    let errors = 0;

    batchAnalysis.analyses.forEach((analysis) => {
      if (analysis.action.type === 'NONE') {
        skipped++;

        results.push({
          manufacturingId: analysis.manufacturing.id,
          status: 'SKIPPED',
        });

        return;
      }

      try {
        const result = this.synchronizationService.execute(analysis);

        if (analysis.manufacturing.status === 'CANCELLED') {
          this.manufacturingRepository.update({
            ...analysis.manufacturing,
            placementId: undefined,
          });
        }
        executed++;

        results.push({
          manufacturingId: analysis.manufacturing.id,
          status: 'EXECUTED',
          result,
        });
      } catch (error) {
        errors++;

        results.push({
          manufacturingId: analysis.manufacturing.id,
          status: 'ERROR',
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });

    // Зберігаємо всі зміни одним записом після завершення batch.
    this.placementRepository.save();
    this.syncStateRepository.save();
    this.manufacturingRepository.save();

    return {
      total: batchAnalysis.total,
      executed,
      skipped,
      errors,
      results,
    };
  }
}
