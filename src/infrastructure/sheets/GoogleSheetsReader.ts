/**
 * ==========================================================
 * ERP КУБ
 * Module: Infrastructure
 * File: GoogleSheetsReader.ts
 * Path: src/infrastructure/sheets/GoogleSheetsReader.ts
 *
 * Зчитування даних із Google Sheets.
 * ==========================================================
 */

import { SheetKey } from './SheetKey';
import { SheetProvider } from './SheetProvider';

export class GoogleSheetsReader {
  constructor(private readonly sheetProvider: SheetProvider) {}

  /**
   * Прочитати всю таблицю разом із заголовком.
   */
  public read(sheetKey: SheetKey): unknown[][] {
    return this.sheetProvider.get(sheetKey).getDataRange().getValues();
  }

  /**
   * Прочитати лише заголовок таблиці.
   */
  public readHeader(sheetKey: SheetKey): string[] {
    const matrix = this.read(sheetKey);

    if (matrix.length === 0) {
      return [];
    }

    return matrix[0].map(String);
  }

  /**
   * Прочитати таблицю без заголовка.
   */
  public readData(sheetKey: SheetKey): unknown[][] {
    const matrix = this.read(sheetKey);

    return matrix.slice(1);
  }
}
