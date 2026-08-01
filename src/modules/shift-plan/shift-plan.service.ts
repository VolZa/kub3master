import { IPlacementRepository } from '../placement/placement.repository.interface';

import { PlacementStatus } from '../../domain/placement/placement.status';

import { IShiftPlanRepository } from './shift-plan.repository.interface';
import { IShiftPlanItemRepository } from './shift-plan-item.repository.interface';

import { ShiftPlan } from './shift-plan.model';
import { ShiftPlanItem } from './shift-plan-item.model';
import { ShiftPlanStatus } from './shift-plan.status';
import { canBeScheduled } from '../placement/placement.rules';

export class ShiftPlanService {
  constructor(
    private readonly planRepository: IShiftPlanRepository,
    private readonly itemRepository: IShiftPlanItemRepository,
    private readonly placementRepository: IPlacementRepository,
  ) {}

  /**
   * Створити нову чернетку змінного завдання.
   */
  createDraft(plan: ShiftPlan): void {
    plan.status = ShiftPlanStatus.DRAFT;

    this.planRepository.create(plan);
  }

  /**
   * Додати виріб у змінне завдання.
   */
  addPlacement(shiftPlanItem: ShiftPlanItem): void {
    const placement = this.placementRepository.findById(
      shiftPlanItem.placementId,
    );

    if (!placement) {
      throw new Error(`Placement ${shiftPlanItem.placementId} not found.`);
    }

    if (!canBeScheduled(placement)) {
      throw new Error(`Placement ${placement.id} cannot be scheduled.`);
    }

    this.itemRepository.create(shiftPlanItem);
  }

  /**
   * Видалити виріб із змінного завдання.
   */
  removePlacement(shiftPlanItemId: number): void {
    this.itemRepository.delete(shiftPlanItemId);
  }

  /**
   * Усі вироби документа.
   */
  getItems(shiftPlanId: number): ShiftPlanItem[] {
    return this.itemRepository.findByPlanId(shiftPlanId);
  }

  /**
   * Затвердити змінне завдання.
   */
  approve(shiftPlanId: number): void {
    const plan = this.planRepository.findById(shiftPlanId);

    if (!plan) {
      throw new Error(`ShiftPlan ${shiftPlanId} not found.`);
    }

    plan.status = ShiftPlanStatus.APPROVED;

    plan.approvedAt = new Date();

    this.planRepository.update(plan);
  }

  /**
   * Повернути у чернетку.
   */
  reopen(shiftPlanId: number): void {
    const plan = this.planRepository.findById(shiftPlanId);

    if (!plan) {
      throw new Error(`ShiftPlan ${shiftPlanId} not found.`);
    }

    plan.status = ShiftPlanStatus.DRAFT;

    plan.approvedAt = undefined;

    this.planRepository.update(plan);
  }
}
