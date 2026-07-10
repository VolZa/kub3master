import { createColumnMap, getValue } from '../../utils/column-mapper';

import { ShiftPlan } from './shift-plan.model';
import { ShiftPlanRow } from './shift-plan.row';
import { ShiftPlanStatus } from './shift-plan.status';

/**
 * Перетворює рядок Google Sheets у доменну модель ShiftPlan.
 */
export function mapSheetRowToShiftPlan(
  row: readonly unknown[],
  columnMap: Record<string, number>,
): ShiftPlan {
  return {
    id: Number(getValue(row, columnMap, 'ShiftPlanId')),

    date: getValue(row, columnMap, 'Date') as Date,

    shift: Number(getValue(row, columnMap, 'Shift')),

    status: toStatus(getValue(row, columnMap, 'Status')),

    revision: Number(getValue(row, columnMap, 'Revision') ?? 1),

    createdAt: getValue(row, columnMap, 'CreatedAt') as Date,
    createdBy: toString(getValue(row, columnMap, 'CreatedBy')),

    approvedAt: toDate(getValue(row, columnMap, 'ApprovedAt')),
    approvedBy: toString(getValue(row, columnMap, 'ApprovedBy')),

    publishedAt: toDate(getValue(row, columnMap, 'PublishedAt')),
    publishedBy: toString(getValue(row, columnMap, 'PublishedBy')),

    closedAt: toDate(getValue(row, columnMap, 'ClosedAt')),
    closedBy: toString(getValue(row, columnMap, 'ClosedBy')),

    comment: toString(getValue(row, columnMap, 'Comment')),
  };
}

/**
 * Перетворює доменну модель у рядок Google Sheets.
 */
export function mapShiftPlanToRow(plan: ShiftPlan): ShiftPlanRow {
  return {
    ShiftPlanId: plan.id,

    Date: plan.date,

    Shift: plan.shift,

    Status: plan.status,

    Revision: plan.revision,

    CreatedAt: plan.createdAt,
    CreatedBy: plan.createdBy,

    ApprovedAt: plan.approvedAt,
    ApprovedBy: plan.approvedBy,

    PublishedAt: plan.publishedAt,
    PublishedBy: plan.publishedBy,

    ClosedAt: plan.closedAt,
    ClosedBy: plan.closedBy,

    Comment: plan.comment,
  };
}

/**
 * Перетворює масив моделей у масив рядків.
 */
export function mapShiftPlansToRows(
  plans: readonly ShiftPlan[],
): ShiftPlanRow[] {
  return plans.map(mapShiftPlanToRow);
}

/* ------------------------------------------------------------------ */

function toStatus(value: unknown): ShiftPlanStatus {
  if (value == null || value === '') {
    return ShiftPlanStatus.DRAFT;
  }

  return value as ShiftPlanStatus;
}

function toDate(value: unknown): Date | undefined {
  return value instanceof Date ? value : undefined;
}

function toString(value: unknown): string | undefined {
  if (value == null || value === '') {
    return undefined;
  }

  return String(value);
}
