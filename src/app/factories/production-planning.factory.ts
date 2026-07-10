import { ProductionPlanningService } from '../../modules/planning/production-planning.service';

import { getPlacementRepository } from './placement.factory';

let service: ProductionPlanningService | null = null;

/**
 * Повертає єдиний екземпляр ProductionPlanningService.
 */
export function getProductionPlanningService(): ProductionPlanningService {
  if (!service) {
    service = new ProductionPlanningService(getPlacementRepository());
  }

  return service;
}
