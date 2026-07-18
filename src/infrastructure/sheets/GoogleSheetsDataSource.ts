/**
 * ==========================================================
 * ERP КУБ
 * Module: Infrastructure
 * File: GoogleSheetsDataSource.ts
 * Path: src/infrastructure/sheets/GoogleSheetsDataSource.ts
 *
 * Базовий DataSource для роботи з Google Sheets.
 * ==========================================================
 */
import { SheetKey } from './SheetKey';
import { SheetProvider } from './SheetProvider';
export abstract class GoogleSheetsDataSource<T = unknown[]> {
  constructor(
    protected readonly sheetProvider: SheetProvider,
    protected readonly sheetKey: SheetKey,
  ) {}

  /**
   * Зчитати всі рядки таблиці.
   */
  public getRows(): T[] {
    return this.sheetProvider
      .get(this.sheetKey)
      .getDataRange()
      .getValues() as T[];
  }

  /**
   * Повністю замінити дані таблиці.
   */
  public replaceRows(rows: T[], startRow = 2): void {
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

    sheet
      .getRange(startRow, 1, rows.length, (rows[0] as unknown[]).length)
      .setValues(rows as unknown[][]);
  }

  /**
   * Додати один рядок.
   */
  public appendRow(row: T): void {
    this.sheetProvider.get(this.sheetKey).appendRow(row as unknown[]);
  }
}
