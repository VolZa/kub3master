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
   * Підготувати таблиці до створення нового Manufacturing.
   *
   * 01_Виготовлення:
   *   вставляє новий рядок перед рядком 2.
   *
   * 10_Оснастка:
   *   зберігає формулу A3,
   *   очищає A3,
   *   вставляє новий рядок перед 3,
   *   повертає формулу в A3.
   */
  public prepareManufacturingCreation(): void {
    const manufacturingSheet = this.sheetProvider.get(SheetKey.MANUFACTURING);

    const toolingSheet = this.sheetProvider.get(SheetKey.TOOLING);

    const formulaR1C1 = toolingSheet.getRange('A3').getFormulaR1C1();

    toolingSheet.getRange('A3').clearContent();

    manufacturingSheet.insertRowBefore(2);

    toolingSheet.insertRowBefore(3);

    if (formulaR1C1) {
      toolingSheet.getRange('A3').setFormulaR1C1(formulaR1C1);
    }
  }

  /**
   * Повністю замінити дані таблиці.
   *
   * Дані записуються починаючи із зазначеного рядка.
   * За замовчуванням заголовок (1-й рядок) не змінюється.
   */
  public replace(
    sheetKey: SheetKey,
    matrix: SheetMatrix,
    dataStartRow = this.DATA_START_ROW,
  ): void {
    const sheet = this.sheetProvider.get(sheetKey);

    const lastRow = sheet.getLastRow();

    if (lastRow >= dataStartRow) {
      sheet
        .getRange(
          dataStartRow,
          1,
          lastRow - dataStartRow + 1,
          sheet.getLastColumn(),
        )
        .clearContent();
    }

    if (matrix.length === 0) {
      return;
    }

    sheet
      .getRange(dataStartRow, 1, matrix.length, matrix[0].length)
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
