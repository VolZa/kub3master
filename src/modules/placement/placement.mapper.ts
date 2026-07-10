import { createColumnMap, getValue } from '../../utils/column-mapper';
import { Placement } from './placement.model';
import { PlacementStatus } from './placement.status';
import { PlacementRow } from './placement.row';

/**
 * Створює карту заголовків листа.
 */
// export function createHeaderMap(
//   headers: readonly unknown[],
// ): Record<string, number> {
//   const map: Record<string, number> = {};

//   headers.forEach((value, index) => {
//     map[String(value)] = index;
//   });

//   return map;
// }

/**
 * Перетворює рядок Google Sheets у доменну модель Placement.
 */
export function mapSheetRowToPlacement(
  row: readonly unknown[],
  headerMap: Record<string, number>,
): Placement {
  const value = (column: keyof PlacementRow): unknown => row[headerMap[column]];

  return {
    id: Number(value('PlacementId')),

    houseId: String(value('HouseId') ?? ''),

    productCode: String(value('ProductCode') ?? ''),

    location: {
      section: String(value('Section') ?? ''),
      floor: Number(value('Floor') ?? 0),
      axis: String(value('Axis') ?? ''),
    },

    status: toStatus(value('Status')),

    priority: Number(value('Priority') ?? 0),

    scheduledDate: toDate(value('ScheduledDate')),
    scheduledShift: toNumber(value('ScheduledShift')),

    producedDate: toDate(value('ProducedDate')),
    producedShift: toNumber(value('ProducedShift')),

    shippedDate: toDate(value('ShippedDate')),

    comment: String(value('Comment') ?? ''),
  };
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

/* -------------------------------------------------------------------------- */

export function mapPlacementToSheetRow(
  placement: Placement,
): (string | number | Date)[] {
  return [
    placement.id,
    placement.houseId,

    placement.location.section,
    placement.location.floor,
    placement.location.axis,

    placement.productCode,

    placement.status,

    placement.priority,

    placement.scheduledDate ?? '',
    placement.scheduledShift ?? '',

    placement.producedDate ?? '',
    placement.producedShift ?? '',

    placement.shippedDate ?? '',

    placement.comment ?? '',
  ];
}

function toStatus(value: unknown): PlacementStatus {
  if (value === '' || value == null) {
    return PlacementStatus.NONE;
  }

  return value as PlacementStatus;
}

function toDate(value: unknown): Date | undefined {
  return value instanceof Date ? value : undefined;
}

function toNumber(value: unknown): number | undefined {
  if (value === '' || value == null) {
    return undefined;
  }

  return Number(value);
}
