/**
 * ==========================================================
 * ERP КУБ
 * Module: Houses
 * File: house.factory.ts
 * Path: src\app\factories\house.factory.ts
 *
 * Factory для створення репозиторію будинків.
 * ==========================================================
 */

import { GoogleSheetsHouseDataSource } from '../../infrastructure/sheets/house/GoogleSheetsHouseDataSource';
import { HouseInMemoryRepository } from '../../domain/houses/house-inmemory.repository';
import { sheetProvider } from './infrastructure.factory';

let repository: HouseInMemoryRepository | null = null;

export function getHouseRepository(): HouseInMemoryRepository {
  if (!repository) {
    const dataSource = new GoogleSheetsHouseDataSource(sheetProvider);
    const rows = dataSource.getRows();
    console.log(`House rows: ${rows.length}`);
    repository = new HouseInMemoryRepository(rows);
  }
  return repository;
}
