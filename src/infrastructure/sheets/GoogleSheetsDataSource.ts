import { SheetKey } from './SheetKey';
import { SheetProvider } from './SheetProvider';

export abstract class GoogleSheetsDataSource {
  constructor(
    protected readonly sheetProvider: SheetProvider,
    protected readonly sheetKey: SheetKey,
  ) {}

  getRows() {
    return this.sheetProvider.get(this.sheetKey).getDataRange().getValues();
  }

  replaceRows(rows: unknown[][], startRow = 2): void {
    const sheet = this.sheetProvider.get(this.sheetKey);

    const lastRow = sheet.getLastRow();

    if (lastRow >= startRow) {
      sheet
        .getRange(startRow, 1, lastRow - startRow + 1, sheet.getLastColumn())
        .clearContent();
    }

    if (!rows.length) {
      return;
    }

    sheet.getRange(startRow, 1, rows.length, rows[0].length).setValues(rows);
  }

  appendRow(row: unknown[]): void {
    this.sheetProvider.get(this.sheetKey).appendRow(row);
  }
}
