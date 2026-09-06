import { IPlacementRepository } from '../placement/placement.repository.interface';

import { Placement } from '../../domain/placement';

import { canBeScheduled } from '../placement/placement.rules';

export class ProductionPlanningService {
  constructor(private readonly placementRepository: IPlacementRepository) {}

  /**
   * Усі вироби, доступні для планування.
   */
  getAvailablePlacements(): Placement[] {
    return this.placementRepository.getAll().filter(canBeScheduled);
  }

  /**
   * Доступні вироби конкретного будинку.
   */
  getAvailablePlacementsByHouse(houseCode: string): Placement[] {
    return this.placementRepository
      .findByHouseCode(houseCode)
      .filter(canBeScheduled);
  }

  /**
   * Доступні вироби певної номенклатури.
   */
  getAvailablePlacementsByProduct(productCode: string): Placement[] {
    return this.placementRepository
      .findByProductCode(productCode)
      .filter(canBeScheduled);
  }

  /**
   * Кількість виробів, що очікують виготовлення.
   */
  countAvailable(): number {
    return this.getAvailablePlacements().length;
  }
}
