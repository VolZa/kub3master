export function getSheetByNameSafe(
  sheetName: string,
): GoogleAppsScript.Spreadsheet.Sheet {
  const sheet = SpreadsheetApp.getActive().getSheetByName(sheetName);

  if (!sheet) {
    throw new Error(`Лист ${sheetName} не знайдено`);
  }

  return sheet;
}

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
