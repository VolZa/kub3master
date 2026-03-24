// modules/bom/bom.repository.ts
import { getSheet } from '../../services/sheets.service';

export function insertBOMRows(rows: any[][]) {
  if (!rows.length) return;

  const sheet = getSheet('01_BOM');

  const startRow = sheet.getLastRow() + 1;

  sheet.getRange(startRow, 1, rows.length, rows[0].length).setValues(rows);
}
