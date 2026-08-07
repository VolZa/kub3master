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
import { GoogleSheetsReader } from './GoogleSheetsReader';
import { GoogleSheetsWriter } from './GoogleSheetsWriter';
import { HeaderSchema } from './mapping/HeaderSchema';
import { TableMapper } from './mapping/TableMapper';
import { SheetKey } from './SheetKey';
import { SheetProvider } from './SheetProvider';

export abstract class GoogleSheetsDataSource<T extends object> {
  private readonly reader: GoogleSheetsReader;
  private readonly writer: GoogleSheetsWriter;

  protected constructor(
    sheetProvider: SheetProvider,
    private readonly sheetKey: SheetKey,
    private readonly expectedHeaders: readonly string[],
  ) {
    this.reader = new GoogleSheetsReader(sheetProvider);
    this.writer = new GoogleSheetsWriter(sheetProvider);
  }

  public getRows(): readonly T[] {
    const matrix = this.reader.read(this.sheetKey);

    if (matrix.length === 0) {
      return [];
    }

    const headers = matrix[0].map(String);
    const data = matrix.slice(1);

    console.log({
      sheet: this.sheetKey,
      actual: headers,
      expected: this.expectedHeaders,
    });

    HeaderSchema.validate(headers, this.expectedHeaders);

    return TableMapper.matrixToRows<T>(headers, data);
  }

  /**
   * Повністю замінити дані таблиці.
   */
  public replaceRows(rows: readonly T[]): void {
    const matrix = TableMapper.rowsToMatrix<T>(this.expectedHeaders, rows);

    this.writer.replace(this.sheetKey, matrix);
  }
  /**
   * Зберегти всі рядки таблиці.(Те саме що replaceRows)
   */
  public saveRows(rows: readonly T[]): void {
    this.replaceRows(rows);
  }
  /**
   * Додати один рядок.
   */
  public appendRow(row: T): void {
    const matrix = TableMapper.rowsToMatrix<T>(this.expectedHeaders, [row]);

    if (matrix.length === 0) {
      return;
    }

    this.writer.append(this.sheetKey, matrix[0]);
  }
}

/** 
Після завершення GoogleSheetsWriter можна зробити GoogleSheetsDataSource таким:

const matrix = reader.read(sheetKey);

const headers = matrix[0].map(String);
const data = matrix.slice(1);

HeaderSchema.validate(headers, HOUSE_HEADERS);

return mapper.matrixToRows(headers, data);
 */
