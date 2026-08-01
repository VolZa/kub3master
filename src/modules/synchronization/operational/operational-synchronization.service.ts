import { ProductionImportService } from '../../productionImport/production-import.service';
import { ProductionSynchronizationResult } from './production-synchronization-result.model';
import { PlacementSelectionService } from '../../placement/placement-selection.service';
import { IPlacementRepository } from '../../placement/placement.repository.interface';
import { PlacementStatus } from '../../../domain/placement/placement.status';
import { ProductionSynchronizationStatus } from './production-synchronization.status';

export class OperationalSynchronizationService {
  constructor(
    private readonly productionImport: ProductionImportService,
    private readonly placementSelection: PlacementSelectionService,
    private readonly placementRepository: IPlacementRepository,
  ) {}

  private canExecute(result: ProductionSynchronizationResult): boolean {
    return (
      result.approved &&
      result.status === ProductionSynchronizationStatus.MATCHED &&
      !!result.placement
    );
  }

  private applyProduction(result: ProductionSynchronizationResult): void {
    const placement = result.placement!;

    placement.status = PlacementStatus.PRODUCED;
    placement.producedDate = result.record.date;
    placement.producedShift = result.record.shift;

    this.placementRepository.update(placement);
  }

  /**
   * Аналізує журнал виробництва та формує список
   * можливих змін без внесення їх у Placement.
   */
  analyze(houseId: string): ProductionSynchronizationResult[] {
    const results: ProductionSynchronizationResult[] = [];
    const reservedPlacementIds = new Set<number>();
    const records = this.productionImport.import();

    for (const record of records) {
      const placement = this.placementSelection.findNextForProduction(
        houseId,
        record.productCode,
        reservedPlacementIds,
      );

      if (!placement) {
        results.push({
          record,
          status: ProductionSynchronizationStatus.NOT_FOUND,
          approved: false,
          message: 'Placement not found',
        });

        continue;
      }

      results.push({
        record,
        placement,
        status: ProductionSynchronizationStatus.MATCHED,
        approved: false,
      });
      reservedPlacementIds.add(placement.id);
    }

    return results;
  }

  /**
   * Автоматично затверджує всі успішно
   * співставлені записи.
   *
   * Пізніше буде замінено ручним підтвердженням
   * через UI.
   */
  // approveMatched(results: ProductionSynchronizationResult[]): void {
  //   let approved = false;

  //   for (const result of results) {
  //     if (
  //       !approved &&
  //       result.status === ProductionSynchronizationStatus.MATCHED
  //     ) {
  //       result.approved = true;
  //       approved = true;
  //     } else {
  //       result.approved = false;
  //     }
  //   }
  // }
  approveMatched(results: ProductionSynchronizationResult[]): void {
    for (const result of results) {
      result.approved =
        result.status === ProductionSynchronizationStatus.MATCHED;
    }
  }

  /**
   * Виконує синхронізацію лише для
   * затверджених записів.
   */
  executeApproved(results: ProductionSynchronizationResult[]): void {
    for (const result of results) {
      if (!this.canExecute(result)) {
        continue;
      }

      this.applyProduction(result);
    }
  }

  execute(results: ProductionSynchronizationResult[]): void {
    for (const result of results) {
      if (!result.approved) {
        continue;
      }

      if (result.status !== ProductionSynchronizationStatus.MATCHED) {
        continue;
      }

      const placement = result.placement;

      if (!placement) {
        continue;
      }

      placement.status = PlacementStatus.PRODUCED;

      placement.producedDate = result.record.date;

      placement.producedShift = result.record.shift;
      Logger.log(
        'UPDATE Placement #%s -> %s',
        placement.id,
        PlacementStatus.PRODUCED,
      );
      this.placementRepository.update(placement);
      this.placementRepository.save();
    }
  }
}
