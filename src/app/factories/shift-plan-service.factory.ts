import { ShiftPlanService } from '../../modules/shiftPlan/shift-plan.service';

import { getPlacementRepository } from './placement.factory';
import { getShiftPlanRepository } from './shift-plan.factory';
import { getShiftPlanItemRepository } from './shift-plan-item.factory';

let service: ShiftPlanService | null = null;

/**
 * Повертає єдиний екземпляр сервісу ShiftPlan.
 */
export function getShiftPlanService(): ShiftPlanService {
  if (!service) {
    service = new ShiftPlanService(
      getShiftPlanRepository(),
      getShiftPlanItemRepository(),
      getPlacementRepository(),
    );
  }

  return service;
}
