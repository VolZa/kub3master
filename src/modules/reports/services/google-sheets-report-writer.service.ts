import { getSheetByNameSafe } from '../../../utils/sheets';
import { SheetRow } from '../model/sheet-row.model';

export class GoogleSheetsReportWriter {
  constructor(private readonly sheetName = '17_ProductReport') {}

  write(row: SheetRow): void {
    const sheet = getSheetByNameSafe(this.sheetName);

    const targetRow = sheet.getLastRow() + 1;

    sheet.getRange(targetRow, 1, 1, row.values.length).setValues([row.values]);
  }
}
