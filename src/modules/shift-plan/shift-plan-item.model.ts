// src/modules/shiftPlan/shift-plan-item.model.ts

export interface ShiftPlanItem {
  id: number;

  shiftPlanId: number;

  placementId: number;

  /**
   * Позиція у змінному завданні.
   * На поточному етапі відповідає номеру форми (1...6).
   * Може бути відсутня у чернетці.
   */
  position?: number;

  comment?: string;
}
