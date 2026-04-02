import { createColumnMap, getValue } from '../utils/column-mapper';

const SHEET_NAME = '_Config_ID_Counters';

/**
 * Генерує наступний ID для заданого типу
 */
// export function generateId(type: string): string {
//   const sheet = SpreadsheetApp.getActive().getSheetByName(SHEET_NAME);

//   if (!sheet) {
//     throw new Error(`Sheet "${SHEET_NAME}" not found`);
//   }

//   const data = sheet.getDataRange().getValues();

//   const headers = data[0];
//   const map = createColumnMap(headers);

//   for (let i = 1; i < data.length; i++) {
//     const row = data[i];

//     const rowType = getValue(row, map, 'Type');

//     if (rowType === type) {
//       let lastId = Number(getValue(row, map, 'Last_ID'));

//       const nextId = lastId + 1;

//       // 🔥 оновлюємо таблицю
//       const colIndex = map['Last_ID'] + 1;
//       sheet.getRange(i + 1, colIndex).setValue(nextId);

//       // 🔥 формат ID
//       return formatId(type, nextId);
//     }
//   }

//   throw new Error(`Unknown ID type: ${type}`);
// }

//mock-версія для тестування без Google Sheets замість^^^^^
let counter = 0;

export function generateId(type: string): string {
  counter++;
  return `${type}_${counter}`;
}

function formatId(type: string, id: number): string {
  const prefixMap: Record<string, string> = {
    product: 'PRD',
    assembly: 'ASM',
    material: 'MAT',
    part: 'PRT',
  };

  const prefix = prefixMap[type] || 'UNK';

  return `${prefix}-${id.toString().padStart(4, '0')}`;
}
