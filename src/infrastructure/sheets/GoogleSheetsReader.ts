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
import { SheetMatrix } from './types/sheet.types';

export class GoogleSheetsReader {
  constructor(private readonly sheetProvider: SheetProvider) {}

  /**
   * Прочитати всю таблицю разом із заголовком.
   */
  // public read(sheetKey: SheetKey): unknown[][] {
  //   return this.sheetProvider.get(sheetKey).getDataRange().getValues();
  // }
  public read(sheetKey: SheetKey): SheetMatrix {
    return this.sheetProvider.get(sheetKey).getDataRange().getValues();
  }

  /**
   * Прочитати лише заголовок таблиці.
   */
  public readHeader(sheetKey: SheetKey): readonly string[] {
    const matrix = this.read(sheetKey);

    if (matrix.length === 0) {
      return [];
    }

    return matrix[0].map(String);
  }

  /**
   * Прочитати таблицю без заголовка.
   */
  public readData(sheetKey: SheetKey): SheetMatrix {
    return this.read(sheetKey).slice(1);
  }
}
