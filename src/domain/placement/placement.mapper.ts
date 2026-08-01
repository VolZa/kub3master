// src\domain\placement\placement.mapper.ts
import { PlacementRow } from '../../modules/placement';
// import { Placement, PlacementStatus } from './';
import { Placement } from './placement.model';
import { PlacementStatus } from './placement.status';

export function mapRowToPlacement(row: PlacementRow): Placement {
  return {
    id: row.PlacementId,

    houseId: row.HouseId,

    productCode: row.ProductCode,

    location: {
      section: row.Section,
      floor: row.Floor,
      axis: row.Axis,
    },

    status: toStatus(row.Status),

    priority: row.Priority,

    scheduledDate: toDate(row.ScheduledDate),
    scheduledShift: row.ScheduledShift,

    producedDate: toDate(row.ProducedDate),
    producedShift: row.ProducedShift,

    shippedDate: toDate(row.ShippedDate),

    comment: row.Comment,
  };
}

export function mapRowsToPlacements(
  rows: readonly PlacementRow[],
): Placement[] {
  return rows.map(mapRowToPlacement);
}

/**
 * Перетворює Placement у PlacementRow.
 */
export function mapPlacementToRow(placement: Placement): PlacementRow {
  return {
    PlacementId: placement.id,

    HouseId: placement.houseId,

    Section: placement.location.section,
    Floor: placement.location.floor,
    Axis: placement.location.axis,

    ProductCode: placement.productCode,

    Status: placement.status,

    Priority: placement.priority,

    ScheduledDate: placement.scheduledDate,
    ScheduledShift: placement.scheduledShift,

    ProducedDate: placement.producedDate,
    ProducedShift: placement.producedShift,

    ShippedDate: placement.shippedDate,

    Comment: placement.comment,
  };
}

/**
 * Перетворює масив Placement у масив PlacementRow.
 */
export function mapPlacementsToRows(
  items: readonly Placement[],
): PlacementRow[] {
  return items.map(mapPlacementToRow);
}
/* ------------------------------------------------------------------ */

function toStatus(value: unknown): PlacementStatus {
  if (value == null || value === '') {
    return PlacementStatus.NONE;
  }

  return value as PlacementStatus;
}

function toDate(value: unknown): Date | undefined {
  return value instanceof Date ? value : undefined;
}
