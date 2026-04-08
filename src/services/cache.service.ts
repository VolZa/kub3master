// import {
//   mapSheetRowToElementRow,
//   mapElementRowToDomain,
// } from '../modules/elements/element.mapper';

import { ElementShort } from '../modules/elements/element.model';
// import { createColumnMap, getValue } from '../utils/column-mapper';

// type ElementMap = Record<string, ElementShort>;

// let elementCache: ElementMap | null = null;

/**
 * Додає елемент у cache (після створення нового елемента)
 */
// export function addElementToCache(element: ElementShort) {
//   // якщо cache ще не ініціалізований — створюємо
//   if (!elementCache) {
//     elementCache = {};
//   }

//   elementCache[element.code] = element;
// }

// 🔥 внутрішнє сховище
const elementCache: Record<string, ElementShort> = {};

// 🔍 отримати з кешу
export function getElementFromCache(code: string): ElementShort | null {
  return elementCache[code] || null;
}

// ➕ додати в кеш
export function addElementToCache(element: ElementShort): void {
  elementCache[element.code] = element;
}

// 🧹 (опціонально) очистити кеш
export function clearElementCache(): void {
  for (const key in elementCache) {
    delete elementCache[key];
  }
}

// export function getElementCache(): ElementMap {
//   if (elementCache) return elementCache;

//   const sheet: GoogleAppsScript.Spreadsheet.Sheet | null =
//     SpreadsheetApp.getActive().getSheetByName('00_Elements');

//   if (!sheet) {
//     throw new Error('Sheet "00_Elements" not found');
//   }

//   const data = sheet.getDataRange().getValues();

//   const headers = data[0];
//   const map = createColumnMap(headers);

//   const result: ElementMap = {};

//   for (let i = 1; i < data.length; i++) {
//     const row = data[i];

//     const elementRow = mapSheetRowToElementRow(row, map);

//     const element: ElementShort = {
//       id: elementRow.ID,
//       code: elementRow.Code,
//       baseUnit: elementRow.BaseUnit,
//     };

//     if (element.code) {
//       result[element.code] = element;
//     }
//   }

//   elementCache = result;

//   return result;
// }
