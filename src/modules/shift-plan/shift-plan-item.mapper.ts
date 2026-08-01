import { getValue } from '../../utils/column-mapper';

import { ShiftPlanItem } from './shift-plan-item.model';
import { ShiftPlanItemRow } from '../shift-plan-item/shift-plan-item.row';

/**
 * Перетворює рядок Google Sheets у доменну модель ShiftPlanItem.
 */
export function mapSheetRowToShiftPlanItem(
  row: readonly unknown[],
  columnMap: Record<string, number>,
): ShiftPlanItem {
  return {
    id: Number(getValue(row, columnMap, 'ShiftPlanItemId')),

    shiftPlanId: Number(getValue(row, columnMap, 'ShiftPlanId')),

    placementId: Number(getValue(row, columnMap, 'PlacementId')),

    position: toNumber(getValue(row, columnMap, 'Position')),

    comment: toString(getValue(row, columnMap, 'Comment')),
  };
}

// src/domain/shift-plan-item/shift-plan-item.mapper.ts

/**
 * Перетворює ShiftPlanItemRow у ShiftPlanItem.
 */
export function mapRowToShiftPlanItem(row: ShiftPlanItemRow): ShiftPlanItem {
  return {
    id: row.ShiftPlanItemId,
    shiftPlanId: row.ShiftPlanId,
    placementId: row.PlacementId,
    position: row.Position,
    comment: row.Comment,
    // інші поля...
  };
}

/**
 * Перетворює масив ShiftPlanItemRow у масив ShiftPlanItem.
 */
export function mapRowsToShiftPlanItems(
  rows: readonly ShiftPlanItemRow[],
): ShiftPlanItem[] {
  return rows.map(mapRowToShiftPlanItem);
}

/**
 * Перетворює доменну модель у рядок Google Sheets.
 */
export function mapShiftPlanItemToRow(item: ShiftPlanItem): ShiftPlanItemRow {
  return {
    ShiftPlanItemId: item.id,

    ShiftPlanId: item.shiftPlanId,

    PlacementId: item.placementId,

    Position: item.position,

    Comment: item.comment,
  };
}

/**
 * Перетворює масив моделей у масив рядків.
 */
export function mapShiftPlanItemsToRows(
  items: readonly ShiftPlanItem[],
): ShiftPlanItemRow[] {
  return items.map(mapShiftPlanItemToRow);
}

/* ------------------------------------------------------------------ */

function toString(value: unknown): string | undefined {
  if (value == null || value === '') {
    return undefined;
  }

  return String(value);
}

function toNumber(value: unknown): number | undefined {
  if (value === '' || value == null) {
    return undefined;
  }

  return Number(value);
}
