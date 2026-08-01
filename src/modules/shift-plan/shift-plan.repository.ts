// import { createColumnMap } from '../../utils/column-mapper';
import { mapRowToShiftPlan } from './shift-plan.mapper';
import { ShiftPlan } from './shift-plan.model';
import { ShiftPlanStatus } from './shift-plan.status';
import { ShiftPlanRow } from './shift-plan.row';

import {
  // mapSheetRowToShiftPlan,
  mapShiftPlansToRows,
} from './shift-plan.mapper';

// import { IShiftPlanRepository } from './shift-plan.repository.interface';

export class ShiftPlanRepository {
  private readonly entities: ShiftPlan[];

  constructor(rows: readonly ShiftPlanRow[]) {
    // Прямо мапимо кожен ряд у модель.
    this.entities = rows.map(mapRowToShiftPlan);
  }
  getAll(): ShiftPlan[] {
    return [...this.entities];
  }

  findById(id: number): ShiftPlan | null {
    return this.entities.find((p) => p.id === id) ?? null;
  }

  findByStatus(status: ShiftPlanStatus): ShiftPlan[] {
    return this.entities.filter((p) => p.status === status);
  }

  findByDate(date: Date): ShiftPlan[] {
    return this.entities.filter((p) => isSameDate(p.date, date));
  }

  create(plan: ShiftPlan): void {
    this.entities.push(plan);
  }

  update(plan: ShiftPlan): void {
    const index = this.entities.findIndex((p) => p.id === plan.id);

    if (index < 0) {
      throw new Error(`ShiftPlan ${plan.id} not found.`);
    }

    this.entities[index] = plan;
  }

  delete(id: number): void {
    const index = this.entities.findIndex((p) => p.id === id);

    if (index >= 0) {
      this.entities.splice(index, 1);
    }
  }

  /**
   * Для запису назад у Google Sheets.
   */
  toRows(): ShiftPlanRow[] {
    return mapShiftPlansToRows(this.entities);
  }
}

/* -------------------------------------------------------------------------- */

function isSameDate(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
