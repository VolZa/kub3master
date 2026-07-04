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

  replaceRows(rows: unknown[][]): void {
    const sheet = this.sheetProvider.get(this.sheetKey);

    sheet.clearContents();

    if (!rows.length) {
      return;
    }

    sheet.getRange(1, 1, rows.length, rows[0].length).setValues(rows);
  }

  appendRow(row: unknown[]): void {
    this.sheetProvider.get(this.sheetKey).appendRow(row);
  }
}
