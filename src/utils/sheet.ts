function getSheetByNameSafe(
  sheetName: string,
): GoogleAppsScript.Spreadsheet.Sheet {
  const sheet = SpreadsheetApp.getActive().getSheetByName(sheetName);

  if (!sheet) {
    throw new Error(`Лист ${sheetName} не знайдено`);
  }

  return sheet;
}

//Створення карти заголовків
function getHeaderMap(
  sheet: GoogleAppsScript.Spreadsheet.Sheet,
): Record<string, number> {
  const headers = sheet
    .getRange(1, 1, 1, sheet.getLastColumn())
    .getValues()[0] as string[];

  const map: Record<string, number> = {};

  headers.forEach((h, i) => (map[h] = i));

  return map;
}

function appendRowSafe(
  sheet: GoogleAppsScript.Spreadsheet.Sheet,
  row: unknown[],
) {
  const lastRow = sheet.getLastRow() + 1;
  sheet.getRange(lastRow, 1, 1, row.length).setValues([row]);
}

//Форматування певних колонок таблиці 00_Elements
//запустити вручну в разі збою форматування
function setupElementSheetFormats(): void {
  const sheet = getSheetByNameSafe('00_Elements');
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];

  const map: Record<string, number> = {};

  headers.forEach((h, i) => {
    map[h] = i;
  });

  const lastRow = sheet.getMaxRows();

  const intFields = ['Diameter', 'Length', 'Width', 'Thickness', 'Density'];
  const decimalFields = ['WeightPerUnit'];

  intFields.forEach((field) => {
    if (map[field] !== undefined) {
      sheet.getRange(2, map[field] + 1, lastRow - 1).setNumberFormat('0');
    }
  });

  decimalFields.forEach((field) => {
    if (map[field] !== undefined) {
      sheet.getRange(2, map[field] + 1, lastRow - 1).setNumberFormat('0.000');
    }
  });
}

// //Створення ID для елемента
// function generateIdByType(type) {
//   const ss = SpreadsheetApp.getActive();
//   const configSheet = ss.getSheetByName('_Config_ID_Counters');
//   if (!configSheet) throw new Error('Лист _Config_ID_Counters не знайдено');

//   const data = configSheet
//     .getRange(2, 1, configSheet.getLastRow() - 1, 2)
//     .getValues();

//   const ranges = ID_RANGES;
//   // const ranges = {
//   //   product:   [1000,1999],
//   //   assembly:  [2000,2999],
//   //   material:  [3000,3999],
//   //   part:      [4000,9999]
//   // };

//   if (!ranges[type]) {
//     throw new Error('Невідомий тип: ' + type);
//   }

//   const [min, max] = ranges[type];

//   for (let i = 0; i < data.length; i++) {
//     if (data[i][0] === type) {
//       let lastId = Number(data[i][1]);
//       let newId = lastId + 1;

//       if (newId > max) {
//         throw new Error('Перевищено діапазон ID для типу ' + type);
//       }

//       // оновлюємо Last_ID
//       configSheet.getRange(i + 2, 2).setValue(newId);

//       return newId;
//     }
//   }

//   throw new Error('Тип не знайдено в _Config_ID_Counters');
// }

// function testNormalize() {
//   normalizeCode("Арматура Ø 8А-І (А-240), L=240
// Арматура Ø8А-I,L=240");
// }
