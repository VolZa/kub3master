/**
 * ==========================================================
 * ERP КУБ
 * Module: Infrastructure
 * File: HeaderSchema.ts
 * Path: src/infrastructure/sheets/mapping/HeaderSchema.ts
 *
 * Перевіряє відповідність структури Google Sheets
 * очікуваній схемі.
 * ==========================================================
 */

export class HeaderSchema {
  /**
   * Перевірити заголовок таблиці.
   */
  public static validate(
    actualHeaders: readonly string[],
    expectedHeaders: readonly string[],
  ): void {
    this.checkEmpty(actualHeaders);
    this.checkDuplicates(actualHeaders);
    this.checkRequired(actualHeaders, expectedHeaders);
  }

  /**
   * Заборонити порожні заголовки.
   */
  private static checkEmpty(headers: readonly string[]): void {
    headers.forEach((header, index) => {
      if (!String(header).trim()) {
        throw new Error(`Empty header at column ${index + 1}.`);
      }
    });
  }

  /**
   * Заборонити дублікати.
   */
  private static checkDuplicates(headers: readonly string[]): void {
    const set = new Set<string>();

    headers.forEach((header) => {
      if (set.has(header)) {
        throw new Error(`Duplicate header "${header}".`);
      }

      set.add(header);
    });
  }

  /**
   * Перевірити наявність усіх обов'язкових колонок.
   */
  private static checkRequired(
    actual: readonly string[],
    expected: readonly string[],
  ): void {
    expected.forEach((header) => {
      if (!actual.includes(header)) {
        throw new Error(`Missing required header "${header}".`);
      }
    });
  }
}
