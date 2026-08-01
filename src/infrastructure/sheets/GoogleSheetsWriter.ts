/**
 * ==========================================================
 * ERP КУБ
 * Module: Infrastructure
 * File: GoogleSheetsWriter.ts
 * Path: src/infrastructure/sheets/GoogleSheetsWriter.ts
 *
 * Запис даних у Google Sheets.
 * ==========================================================
 */

import { SheetProvider } from './SheetProvider';
import { SheetKey } from './SheetKey';
import { SheetMatrix, SheetRow } from './types/sheet.types';

export class GoogleSheetsWriter {
  private readonly DATA_START_ROW = 2;
  constructor(private readonly sheetProvider: SheetProvider) {}
  /**
   * Повністю замінити дані таблиці.
   *
   * Дані записуються починаючи із зазначеного рядка.
   * За замовчуванням заголовок (1-й рядок) не змінюється.
   */
  public replace(sheetKey: SheetKey, matrix: SheetMatrix): void {
    const sheet = this.sheetProvider.get(sheetKey);

    const lastRow = sheet.getLastRow();

    if (lastRow >= this.DATA_START_ROW) {
      sheet
        .getRange(
          this.DATA_START_ROW,
          1,
          lastRow - this.DATA_START_ROW + 1,
          sheet.getLastColumn(),
        )
        .clearContent();
    }

    if (matrix.length === 0) {
      return;
    }

    sheet
      .getRange(this.DATA_START_ROW, 1, matrix.length, matrix[0].length)
      .setValues(matrix.map((row) => [...row]));
  }

  /**
   * Додати один рядок у кінець таблиці.
   */
  public append(sheetKey: SheetKey, row: SheetRow): void {
    const sheet = this.sheetProvider.get(sheetKey);

    sheet.appendRow([...row]);
  }
}
