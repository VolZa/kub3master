/**
 * ==========================================================
 * ERP КУБ
 * Module: Manufacturing
 * File: GoogleSheetsManufacturingBufferReader.ts
 * Path: src/infrastructure/sheets/manufacturing/GoogleSheetsManufacturingBufferReader.ts
 *
 * Layer: Infrastructure / Sheets
 *
 * Призначення:
 * Читання фізичного рядка-буфера Manufacturing
 * з 01_Виготовлення.
 *
 * Reader не виконує валідацію та не перетворює дані
 * у ManufacturingInput.
 * ==========================================================
 */

import { SheetKey } from '../SheetKey';
import { SheetProvider } from '../SheetProvider';

export class GoogleSheetsManufacturingBufferReader {
  private readonly BUFFER_ROW = 2;
  private readonly COLUMN_COUNT = 12;

  constructor(private readonly sheetProvider: SheetProvider) {}

  public read(): readonly unknown[] {
    const sheet = this.sheetProvider.get(SheetKey.MANUFACTURING);

    return sheet
      .getRange(this.BUFFER_ROW, 1, 1, this.COLUMN_COUNT)
      .getValues()[0];
  }
}
