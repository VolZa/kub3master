/**
 * ==========================================================
 * ERP КУБ
 * Module: Manufacturing
 * Layer: Application / Mapping
 * File: manufacturingDomainMapper.ts
 * Path: src/modules/manufacturing/mapping/manufacturingDomainMapper.ts
 *
 * Перетворення фізичного ManufacturingRow у Domain-модель
 * Manufacturing.
 * ==========================================================
 */

import { Manufacturing } from '../../../domain/manufacturing/manufacturing.model';
import { ManufacturingStatus } from '../../../domain/manufacturing/manufacturing-status';

import { ManufacturingRow } from '../../../infrastructure/sheets/manufacturing/manufacturing.row';

export class ManufacturingDomainMapper {
  public static mapRowToDomain(row: ManufacturingRow): Manufacturing {
    return {
      id: this.mapId(row.ID),
      date: row['Дата'],
      shift: String(row['Зміна'] ?? '').trim(),
      houseCode: String(row['Будинок'] ?? '').trim(),
      productCode: this.normalizeProductCode(row['Код виробу']),
      quantity: this.mapQuantity(row['Кількість']),
      placementId: this.mapPlacementId(row['Позиція']),
      master: String(row['Майстер'] ?? '').trim(),
      comment: String(row['Примітка'] ?? '').trim(),
      status: this.mapStatus(row['Статус']),
      createdAt: this.mapDate(row['Створено'], 'Створено'),
      updatedAt: this.mapDate(row['Змінено'], 'Змінено'),
    };
  }

  private static mapId(value: string | undefined): string {
    const id = String(value ?? '').trim();

    if (!id) {
      throw new Error('Manufacturing ID is empty.');
    }

    return id;
  }

  private static mapQuantity(value: number | undefined): number {
    const quantity = Number(value);

    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new Error(`Invalid Manufacturing quantity: "${value}"`);
    }

    return quantity;
  }

  private static mapPlacementId(
    value: number | string | undefined,
  ): number | undefined {
    if (value === undefined || value === null || value === '') {
      return undefined;
    }

    const placementId = Number(value);

    if (!Number.isInteger(placementId) || placementId <= 0) {
      throw new Error(`Invalid PlacementId: "${value}"`);
    }

    return placementId;
  }

  private static mapStatus(value: string): ManufacturingStatus {
    const status = String(value ?? '').trim();

    if (status === 'ACTIVE' || status === 'CANCELLED') {
      return status;
    }

    throw new Error(`Unknown Manufacturing status: "${status}"`);
  }

  private static mapDate(value: Date | undefined, fieldName: string): Date {
    if (!(value instanceof Date) || isNaN(value.getTime())) {
      throw new Error(`Invalid Manufacturing date in field "${fieldName}".`);
    }

    return value;
  }

  private static normalizeProductCode(value: string | undefined): string {
    return String(value ?? '').replace(/\s+/g, '');
  }

  public static mapDomainToRow(item: Manufacturing): ManufacturingRow {
    return {
      ID: item.id,
      Дата: item.date,
      Зміна: item.shift,
      Будинок: item.houseCode,
      'Код виробу': item.productCode,
      Кількість: item.quantity,
      Позиція: item.placementId,
      Майстер: item.master,
      Примітка: item.comment,
      Статус: item.status,
      Створено: item.createdAt,
      Змінено: item.updatedAt,
    };
  }
}
// Mapper має два принципи:

// Позиція порожня → undefined.
// Статус, Створено, Змінено мають бути заповнені; якщо ні — Mapper кидає помилку.

// ID          → id
// Дата        → date
// Зміна       → shift
// Будинок     → houseCode
// Код виробу  → productCode
// Кількість   → quantity
// Позиція     → placementId
// Майстер     → master
// Примітка    → comment
// Статус      → status
// Створено    → createdAt
// Змінено     → updatedAt
