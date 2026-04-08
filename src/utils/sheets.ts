// export function getSheet(name: string) {
//     const sheet = SpreadsheetApp.getActiveSpreadsheet()
//         .getSheetByName(name);
//   if (!sheet) throw new Error(`Sheet ${name} not found`);
//   return sheet;
// }
export function getSheetByNameSafe(
  sheetName: string,
): GoogleAppsScript.Spreadsheet.Sheet {
  const sheet = SpreadsheetApp.getActive().getSheetByName(sheetName);

  if (!sheet) {
    throw new Error(`Лист ${sheetName} не знайдено`);
  }

  return sheet;
}
// export function getHeaderMap(
//     sheet: GoogleAppsScript.Spreadsheet.Sheet) {
//     const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn())
//         .getValues()[0];
//   const map: Record<string, number> = {};
//   headers.forEach((h, i) => (map[h] = i));
//   return map;
// }
//Створення карти заголовків
export function getHeaderMap(
  sheet: GoogleAppsScript.Spreadsheet.Sheet,
): Record<string, number> {
  const headers = sheet
    .getRange(1, 1, 1, sheet.getLastColumn())
    .getValues()[0] as string[];

  const map: Record<string, number> = {};

  headers.forEach((h, i) => (map[h] = i));

  return map;
}
