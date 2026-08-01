// src\modules\shift-plan\shift-plan-item.repository.ts
import { createColumnMap } from '../../utils/column-mapper';
import { mapRowToShiftPlanItem } from './shift-plan-item.mapper';
import { ShiftPlanItem } from './shift-plan-item.model';
import { ShiftPlanItemRow } from '../shift-plan-item/shift-plan-item.row';

import {
  mapSheetRowToShiftPlanItem,
  mapShiftPlanItemsToRows,
} from './shift-plan-item.mapper';

import { IShiftPlanItemRepository } from './shift-plan-item.repository.interface';

export class ShiftPlanItemRepository {
  private readonly entities: ShiftPlanItem[];

  constructor(rows: readonly ShiftPlanItemRow[]) {
    this.entities = rows.map(mapRowToShiftPlanItem);
  }

  findByPlanId(shiftPlanId: number): ShiftPlanItem[] {
    return this.entities.filter((item) => item.shiftPlanId === shiftPlanId);
  }

  create(item: ShiftPlanItem): void {
    this.entities.push(item);
  }

  update(item: ShiftPlanItem): void {
    const index = this.entities.findIndex((i) => i.id === item.id);

    if (index < 0) {
      throw new Error(`ShiftPlanItem  with id=${item.id} not found`);
    }

    this.entities[index] = item;
  }

  getById(id: number): ShiftPlanItem | null {
    return this.entities.find((i) => i.id === id) ?? null;
  }

  delete(Id: number): void {
    const index = this.entities.findIndex((i) => i.id === Id);

    if (index >= 0) {
      this.entities.splice(index, 1);
    }
  }

  deleteByPlanId(shiftPlanId: number): void {
    for (let i = this.entities.length - 1; i >= 0; i--) {
      if (this.entities[i].shiftPlanId === shiftPlanId) {
        this.entities.splice(i, 1);
      }
    }
  }

  /**
   * Для запису назад у Google Sheets.
   */
  toRows(): ShiftPlanItemRow[] {
    return mapShiftPlanItemsToRows(this.entities);
  }
}
