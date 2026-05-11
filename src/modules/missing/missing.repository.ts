import { getSheetByNameSafe } from '../../utils/sheets';

const SHEET_NAME = '03_MissingElements';

export function addMissingElement(code: string, source: string) {
  const sheet = getSheetByNameSafe(SHEET_NAME);

  const existing = sheet
    .getDataRange()
    .getValues()
    .slice(1)
    .find((row) => row[0] === code);

  if (existing) return; // 🔥 не дублюємо

  sheet.appendRow([code, 'new', source, new Date()]);
}
