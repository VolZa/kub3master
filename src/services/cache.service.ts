import { ElementShort } from '../modules/elements/element.model';
import { createColumnMap, getValue } from '../utils/column-mapper';

type ElementCacheItem = {
  id: string;
  code: string;
  baseUnit: string;
};

type ElementMap = Record<string, ElementCacheItem>;

let elementCache: ElementMap | null = null;

/**
 * Додає елемент у cache (після створення нового елемента)
 */
export function addElementToCache(element: ElementShort) {
  // якщо cache ще не ініціалізований — створюємо
  if (!elementCache) {
    elementCache = {};
  }

  elementCache[element.code] = element;
}

export function getElementCache(): ElementMap {
  if (elementCache) return elementCache;

  const sheet: GoogleAppsScript.Spreadsheet.Sheet | null =
    SpreadsheetApp.getActive().getSheetByName('00_Elements');

  if (!sheet) {
    throw new Error('Sheet "00_Elements" not found');
  }

  const data = sheet.getDataRange().getValues();

  const headers = data[0];
  const map = createColumnMap(headers);

  const result: ElementMap = {};

  for (let i = 1; i < data.length; i++) {
    const row = data[i];

    const id = getValue(row, map, 'ID');
    const code = getValue(row, map, 'Code');
    const baseUnit = getValue(row, map, 'baseUnit');

    if (code) {
      result[code] = { id, code, baseUnit };
    }
  }

  elementCache = result;

  return result;
}
