import { createColumnMap, getValue } from '../../utils/column-mapper';
import { normalizeProductCode, parseDate } from '../../utils/normalize';

import { ProductionRecord } from './production-record.model';
import { ProductionRecordRow } from './production-record.row';

/**
 * Створює карту заголовків листа.
 */
export function createHeaderMap(
  headers: readonly unknown[],
): Record<string, number> {
  return createColumnMap(headers.map(String));
}

/**
 * Перетворює рядок Google Sheets у ProductionRecord.
 */
export function mapSheetRowToProductionRecord(
  row: readonly unknown[],
  headerMap: Record<string, number>,
): ProductionRecord {
  return {
    date: parseDate(getValue(row, headerMap, 'Дата')),

    shift: toNumber(getValue(row, headerMap, 'Зміна')),

    productCode: normalizeProductCode(
      String(getValue(row, headerMap, 'Код виробу') ?? ''),
    ),

    master: toOptionalString(getValue(row, headerMap, 'Майстер')),

    comment: toOptionalString(getValue(row, headerMap, 'Примітка')),
  };
}

/**
 * Перетворює ProductionRecord у рядок таблиці.
 */
export function mapProductionRecordToRow(
  record: ProductionRecord,
): ProductionRecordRow {
  return {
    Дата: record.date,
    Зміна: record.shift,
    'Код виробу': record.productCode,
    Майстер: record.master,
    Примітка: record.comment,
  };
}

export function mapProductionRecordsToRows(
  items: readonly ProductionRecord[],
): ProductionRecordRow[] {
  return items.map(mapProductionRecordToRow);
}

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

// import { createColumnMap, getValue } from '../../utils/column-mapper';

// import { ProductionRecord } from './production-record.model';
// import { ProductionRecordRow } from './production-record.row';

// import { normalizeProductCode } from '../../utils/normalize';

// /**
//  * Створює карту заголовків листа.
//  */
// export function createHeaderMap(
//   headers: readonly unknown[],
// ): Record<string, number> {
//   return createColumnMap(headers.map(String));
// }

// /**
//  * Перетворює рядок Google Sheets у ProductionRecord.
//  */
// export function mapSheetRowToProductionRecord(
//   row: readonly unknown[],
//   headerMap: Record<string, number>,
// ): ProductionRecord {
//   return {
//     date: getValue(row, headerMap, 'Date') as Date,

//     shift: toNumber(getValue(row, headerMap, 'Shift')),

//     productCode: normalizeProductCode(
//       String(getValue(row, headerMap, 'ProductCode') ?? ''),
//     ),

//     master: toOptionalString(getValue(row, headerMap, 'Master')),

//     comment: toOptionalString(getValue(row, headerMap, 'Comment')),
//   };
// }

// /**
//  * Перетворює ProductionRecord у рядок таблиці.
//  */
// export function mapProductionRecordToRow(
//   record: ProductionRecord,
// ): ProductionRecordRow {
//   return {
//     Date: record.date,

//     Shift: record.shift,

//     ProductCode: record.productCode,

//     Master: record.master,

//     Comment: record.comment,
//   };
// }

// /**
//  * Перетворює масив ProductionRecord у масив рядків.
//  */
// export function mapProductionRecordsToRows(
//   records: readonly ProductionRecord[],
// ): ProductionRecordRow[] {
//   return records.map(mapProductionRecordToRow);
// }

// /* -------------------------------------------------------------------------- */

// function toNumber(value: unknown): number | undefined {
//   if (value === '' || value == null) {
//     return undefined;
//   }

//   return Number(value);
// }

// function toOptionalString(value: unknown): string | undefined {
//   const text = String(value ?? '').trim();

//   return text.length ? text : undefined;
// }
