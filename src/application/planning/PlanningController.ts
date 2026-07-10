import { ProductionPlanningService } from '../../modules/planning/production-planning.service';
import { ShiftPlanService } from '../../modules/shiftPlan/shift-plan.service';

import { ShiftPlan } from '../../modules/shiftPlan/shift-plan.model';
import { ShiftPlanItem } from '../../modules/shiftPlan/shift-plan-item.model';

export class PlanningController {
  constructor(
    private readonly planningService: ProductionPlanningService,
    private readonly shiftPlanService: ShiftPlanService,
  ) {}

  /**
   * Створює порожню чернетку змінного завдання.
   */
  createDraft(plan: ShiftPlan): void {
    this.shiftPlanService.createDraft(plan);
  }

  /**
   * Повертає вироби,
   * доступні для планування.
   */
  getAvailablePlacements(houseId: string) {
    return this.planningService.getAvailablePlacementsByHouse(houseId);
  }

  /**
   * Додає виріб
   * у змінне завдання.
   */
  addPlacement(item: ShiftPlanItem): void {
    this.shiftPlanService.addPlacement(item);
  }

  /**
   * Повертає рядки документа.
   */
  getShiftPlanItems(shiftPlanId: number) {
    return this.shiftPlanService.getItems(shiftPlanId);
  }

  /**
   * Затвердити документ.
   */
  approve(shiftPlanId: number): void {
    this.shiftPlanService.approve(shiftPlanId);
  }
}
