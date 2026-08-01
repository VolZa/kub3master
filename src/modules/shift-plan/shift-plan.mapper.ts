// src\modules\shift-plan\shift-plan.mapper.ts
import { getValue } from '../../utils/column-mapper';

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

// src/domain/shift-plan/shift-plan.mapper.ts

/**
 * Перетворює ShiftPlanRow у доменну модель ShiftPlan.
 */
export function mapRowToShiftPlan(row: ShiftPlanRow): ShiftPlan {
  return {
    id: row.ShiftPlanId,
    date: row.Date,
    shift: row.Shift,
    // status: row.Status ?? ShiftPlanStatus.DRAFT,
    status: toStatus(row.Status),
    revision: row.Revision,
    createdAt: row.CreatedAt,
    createdBy: row.CreatedBy,
    approvedAt: toDate(row.ApprovedAt),
    approvedBy: toString(row.ApprovedBy),
    publishedAt: toDate(row.PublishedAt),
    publishedBy: toString(row.PublishedBy),
    // closedAt: row.ClosedAt,
    closedAt: toDate(row.ClosedAt),
    closedBy: toString(row.ClosedBy),
    comment: toString(row.Comment),
  };
}

/**
 * Перетворює масив ShiftPlanRow у масив ShiftPlan.
 */
export function mapRowsToShiftPlans(
  rows: readonly ShiftPlanRow[],
): ShiftPlan[] {
  return rows.map(mapRowToShiftPlan);
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
