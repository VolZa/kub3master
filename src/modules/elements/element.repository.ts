import { getElementCache } from '../../services/cache.service';
import { getSheet } from '../../services/sheets.service';
import { ElementRow } from './element.model';
import { ELEMENT_HEADERS } from './element.schema';

export function findElementByCode(code: string) {
  const cache = getElementCache();

  return cache[code] || null;
}

// export function findElementByCode(code: string) {
//   const sheet = getSheet('00_Elements');
//   const data = sheet.getDataRange().getValues();

//   for (let i = 1; i < data.length; i++) {
//     if (data[i][1] === code) {
//       return {
//         id: data[i][0],
//         code: data[i][1],
//       };
//     }
//   }

//   return null;
// }

export function insertElementRow(row: ElementRow): void {
  const sheet = getSheet('00_Elements');
  const headers = ELEMENT_HEADERS;

  const mappedRow = headers.map((h) => {
    const key = h as keyof ElementRow;
    return row[key] ?? '';
  });

  sheet.appendRow(mappedRow);
}
