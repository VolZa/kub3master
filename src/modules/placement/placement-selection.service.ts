import { Placement } from './placement.model';
import { IPlacementRepository } from './placement.repository.interface';

import { canBeScheduled } from './placement.rules';
import { PlacementStatus } from './placement.status';

export class PlacementSelectionService {
  constructor(private readonly repository: IPlacementRepository) {}

  /**
   * Знаходить наступний виріб,
   * який необхідно вважати виготовленим.
   */
  findNextForProduction(
    houseId: string,
    productCode: string,
    reservedPlacementIds: Set<number>,
  ): Placement | null {
    return (
      this.repository
        .getAll()
        .filter((placement) => placement.houseId === houseId)
        .filter((placement) => placement.productCode === productCode)
        .filter((placement) => placement.status === PlacementStatus.NONE)
        .find((placement) => !reservedPlacementIds.has(placement.id)) ?? null
    );
  }
}

/* -------------------------------------------------------------------------- */

/**
 * Поки що залишаємо природний порядок.
 *
 * Надалі тут з'явиться:
 *  - пріоритет
 *  - поверх
 *  - секція
 *  - вісь
 */
function comparePlacement(a: Placement, b: Placement): number {
  return a.id - b.id;
}
