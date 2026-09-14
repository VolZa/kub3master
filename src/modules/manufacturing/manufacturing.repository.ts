/**
 * ==========================================================
 * ERP КУБ
 * Module: Manufacturing
 * File: manufacturing.repository.ts
 * Path: src/modules/manufacturing/manufacturing.repository.ts
 *
 * Призначення:
 * Репозиторій Manufacturing.
 * Зберігає доменні об'єкти в пам'яті та передає зміни
 * до Google Sheets через DataSource.
 * ==========================================================
 */

import { Manufacturing } from '../../domain/manufacturing/manufacturing.model';

import { GoogleSheetsManufacturingDataSource } from '../../infrastructure/sheets/manufacturing/GoogleSheetsManufacturingDataSource';

import { ManufacturingDomainMapper } from './mapping/manufacturingDomainMapper';
import { IManufacturingRepository } from './manufacturing.repository.interface';

export class ManufacturingRepository implements IManufacturingRepository {
  private readonly items: Manufacturing[];

  constructor(
    items: Manufacturing[],
    private readonly dataSource: GoogleSheetsManufacturingDataSource,
  ) {
    this.items = [...items];
  }

  public getAll(): Manufacturing[] {
    return [...this.items];
  }

  public findById(id: string): Manufacturing | null {
    return this.items.find((item) => item.id === id) ?? null;
  }

  public create(item: Manufacturing): void {
    this.items.unshift(item);
  }

  public update(item: Manufacturing): void {
    const index = this.items.findIndex((existing) => existing.id === item.id);

    if (index === -1) {
      throw new Error(`Manufacturing ${item.id} not found.`);
    }

    this.items[index] = item;
  }

  public save(): void {
    const rows = this.items.map((item) =>
      ManufacturingDomainMapper.mapDomainToRow(item),
    );

    this.dataSource.saveRows(rows);
  }
}
