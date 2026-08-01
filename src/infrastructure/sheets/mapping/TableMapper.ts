/**
 * ==========================================================
 * ERP КУБ
 * Module: Infrastructure
 * File: GenericSheetObjectMapper.ts
 * Path: src/infrastructure/sheets/mapping/GenericSheetObjectMapper.ts
 *
 * Перетворює табличні дані у Row-об'єкти та назад.
 * ==========================================================
 */

import { SheetMatrix } from '../types/sheet.types';

export class TableMapper {
  /**
   * Перетворити табличні дані у Row-об'єкти.
   */
  // public static matrixToRows<T extends object>(
  //   headers: readonly string[],
  //   rows: readonly unknown[][],
  // ): T[]
  public static matrixToRows<T>(
    headers: readonly string[],
    rows: SheetMatrix,
  ): T[] {
    return rows.map((values) => {
      const row = {} as Record<string, unknown>;

      headers.forEach((header, index) => {
        row[header] = index < values.length ? values[index] : undefined;
      });

      return row as T;
    });
  }

  /**
   * Перетворити Row-об'єкти у табличні дані.
   */
  public static rowsToMatrix<T extends object>(
    headers: readonly string[],
    rows: readonly T[],
  ): SheetMatrix {
    return rows.map((row) =>
      headers.map((header) => (row as Record<string, unknown>)[header]),
    );
  }
}

// export  class  TableMapper {
//   /**
//    * Перетворити табличні дані у Row-об'єкти.
//    */
//   public static matrixToRows<T extends object>(
//     headers: readonly string[],
//     rows: readonly unknown[][],
//   ): T[] {
//     return rows.map((values) => {
//       const row = {} as Record<string, unknown>;

//       headers.forEach((header, index) => {
//         row[header] = index < values.length ? values[index] : undefined;
//       });

//       return row as T;
//     });
//   }

//   /**
//    * Перетворити Row-об'єкти у табличні дані.
//    */
//   public static rowsToMatrix<T extends object>(
//     headers: readonly string[],
//     rows: readonly T[],
//   ): unknown[][] {
//     return rows.map((row) =>
//       headers.map((header) => (row as Record<string, unknown>)[header]),
//     );
//   }
// }

/**
 * ==========================================================
 * ERP КУБ
 * Module: Infrastructure
 * File: GenericSheetObjectMapper.ts
 * Path: src/infrastructure/sheets/mapping/GenericSheetObjectMapper.ts
 *
 * Універсальний mapper між матрицею Google Sheets
 * та типізованими Row-об'єктами.
 * ==========================================================
 */
// import { GoogleSheetsReader } from '../GoogleSheetsReader';

// export class GenericSheetObjectMapper<T extends object> {
//   /**
//    * Перетворити матрицю Google Sheets у масив Row-об'єктів.
//    */
//   public matrixToRows(
//     headers: readonly string[],
//     rows: readonly unknown[][],
//   ): T[];

//   /**
//    * Перетворити Row-об'єкти назад у матрицю
//    * відповідно до порядку колонок аркуша.
//    */
//   public rowsToMatrix(
//     headers: readonly string[],
//     rows: readonly T[],
//   ): unknown[][];
// }
