/**
 * ==========================================================
 * ERP КУБ
 * Module: Manufacturing Synchronization
 * Layer: Application / Orchestration
 * File: manufacturing-synchronization-application.service.ts
 * Path: src/modules/manufacturingSync/services/manufacturing-synchronization-application.service.ts
 *
 * Координує повний цикл синхронізації Manufacturing:
 * analyze → execute → save.
 * ==========================================================
 */

import { Manufacturing } from '../../../domain/manufacturing/manufacturing.model';
import { IManufacturingSyncStateRepository } from '../../../domain/manufacturing-sync/manufacturing-sync-state.repository.interface';

import { IPlacementRepository } from '../../placement/placement.repository.interface';

import { ManufacturingSynchronizationResult } from '../types/manufacturing-synchronization-result';

import { ManufacturingSynchronizationService } from './manufacturing-synchronization.service';

import { ManufacturingSynchronizationAnalysis } from '../types/manufacturing-synchronization-analysis';

export class ManufacturingSynchronizationApplicationService {
  private readonly synchronizationService: ManufacturingSynchronizationService;

  constructor(
    private readonly syncStateRepository: IManufacturingSyncStateRepository,
    private readonly placementRepository: IPlacementRepository,
  ) {
    this.synchronizationService = new ManufacturingSynchronizationService(
      syncStateRepository,
      placementRepository,
    );
  }

  public analyze(
    manufacturing: Readonly<Manufacturing>,
  ): ManufacturingSynchronizationAnalysis {
    return this.synchronizationService.analyze(manufacturing);
  }

  public synchronize(
    manufacturing: Readonly<Manufacturing>,
  ): ManufacturingSynchronizationResult {
    const analysis = this.synchronizationService.analyze(manufacturing);

    const result = this.synchronizationService.execute(analysis);

    this.placementRepository.save();
    this.syncStateRepository.save();

    return result;
  }
}
