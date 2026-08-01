import { ProductionRecord } from './production-record.model';
import { ProductionRow } from '../production/production.row';

export function mapRowToProductionRecord(row: ProductionRow): ProductionRecord {
  return {
    date: toDate(row.Date),
    productCode: row.Code,
    shift: row.Shift ? Number(row.Shift) : undefined,
    master: row.Master,
    comment: row.Note,
  };
}

export function mapProductionRecordToRow(
  record: ProductionRecord,
): ProductionRow {
  return {
    Date: record.date,
    // Shift: record.shift != null ? String(record.shift) : '',
    Shift: record.shift ?? 0,
    Code: toOptionalString(record.productCode) ?? '',
    Master: toOptionalString(record.master) ?? '',
    Note: toOptionalString(record.comment) ?? '',
  };
}

// export function mapProductionRecordsToRows(
//   items: readonly ProductionRecord[],
// ): ProductionRow[] {
//   return items.map(mapProductionRecordToRow);
// }
/* -------------------------------------------------------------------------- */

function toNumber(value: unknown): number | undefined {
  if (value === '' || value == null) {
    return undefined;
  }

  return Number(value);
}

function toOptionalString(value: unknown): string | undefined {
  const text = String(value ?? '').trim();

  return text.length ? text : undefined;
}

function toDate(value: string | Date): Date {
  return value instanceof Date ? value : new Date(value);
}
