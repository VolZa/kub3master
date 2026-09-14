/**
 * ==========================================================
 * ERP КУБ
 * Module: Manufacturing
 * File: manufacturing.factory.ts
 * Path: src/app/factories/manufacturing.factory.ts
 *
 * Призначення:
 * Створення та кешування ManufacturingRepository.
 * ==========================================================
 */

import { ManufacturingRepository } from '../../modules/manufacturing/manufacturing.repository';
import { GoogleSheetsManufacturingDataSource } from '../../infrastructure/sheets/manufacturing/GoogleSheetsManufacturingDataSource';
import { ManufacturingDomainMapper } from '../../modules/manufacturing/mapping/manufacturingDomainMapper';

import { sheetProvider } from './infrastructure.factory';

let repository: ManufacturingRepository | null = null;

export function getManufacturingRepository(): ManufacturingRepository {
  if (!repository) {
    const dataSource = new GoogleSheetsManufacturingDataSource(sheetProvider);

    const manufacturingItems = dataSource
      .getRows()
      .map((row) => ManufacturingDomainMapper.mapRowToDomain(row));

    repository = new ManufacturingRepository(manufacturingItems, dataSource);
  }

  return repository;
}
