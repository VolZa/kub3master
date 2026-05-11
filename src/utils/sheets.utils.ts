export function insertRows(
  sheet: GoogleAppsScript.Spreadsheet.Sheet,
  rows: any[][],
): void {
  if (!rows.length) return;

  const startRow = getFirstEmptyRow(sheet);

  sheet.getRange(startRow, 1, rows.length, rows[0].length).setValues(rows);
}

export function getFirstEmptyRow(
  sheet: GoogleAppsScript.Spreadsheet.Sheet,
): number {
  const data = sheet.getDataRange().getValues();

  // йдемо знизу вверх
  for (let i = data.length - 1; i >= 0; i--) {
    const hasData = data[i].some((cell) => cell !== '' && cell !== null);

    if (hasData) {
      return i + 2; // +1 бо індекс, +1 наступний рядок
    }
  }

  return 2; // тільки header
}
