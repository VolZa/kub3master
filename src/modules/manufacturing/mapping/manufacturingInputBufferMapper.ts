/**
 * ==========================================================
 * ERP КУБ
 * Module: Manufacturing
 * File: manufacturingInputBufferMapper.ts
 * Path: src/modules/manufacturing/mapping/manufacturingInputBufferMapper.ts
 *
 * Layer: Application / Mapping
 *
 * Призначення:
 * Перетворення фізичного рядка-буфера 01_Виготовлення
 * у ManufacturingInput.
 *
 * Mapper не виконує валідацію та не записує дані
 * у Google Sheets.
 * ==========================================================
 */

import { ManufacturingInput } from '../types/manufacturing-input';

export class ManufacturingInputBufferMapper {
  public static mapRowToInput(row: readonly unknown[]): ManufacturingInput {
    return {
      date: this.mapDate(row[1]),
      shift: this.mapString(row[2]),
      houseCode: this.mapString(row[3]),
      productCode: this.mapString(row[4]),
      quantity: this.mapQuantity(row[5]),
      placementId: this.mapPlacementId(row[6]),
      master: this.mapString(row[7]),
      comment: this.mapString(row[8]),
    };
  }

  private static mapDate(value: unknown): Date | undefined {
    if (!(value instanceof Date)) {
      return undefined;
    }

    if (Number.isNaN(value.getTime())) {
      return undefined;
    }

    return value;
  }

  private static mapString(value: unknown): string {
    return String(value ?? '').trim();
  }

  private static mapQuantity(value: unknown): number | undefined {
    if (typeof value !== 'number') {
      return undefined;
    }

    return Number.isFinite(value) ? value : undefined;
  }

  private static mapPlacementId(value: unknown): number | undefined {
    if (value === '' || value === null || value === undefined) {
      return undefined;
    }

    if (typeof value !== 'number') {
      return undefined;
    }

    if (!Number.isInteger(value) || value <= 0) {
      return undefined;
    }

    return value;
  }
}
