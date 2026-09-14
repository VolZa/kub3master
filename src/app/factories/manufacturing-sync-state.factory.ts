// src/app/factories/manufacturing-sync-state.factory.ts

import { ManufacturingSyncStateRepository } from '../../modules/manufacturingSync/manufacturing-sync-state.repository';
import { GoogleSheetsManufacturingSyncStateDataSource } from '../../infrastructure/sheets/manufacturingSyncState/GoogleSheetsManufacturingSyncStateDataSource';

import { sheetProvider } from './infrastructure.factory';

let repository: ManufacturingSyncStateRepository | null = null;

export function getManufacturingSyncStateRepository(): ManufacturingSyncStateRepository {
  if (!repository) {
    const dataSource = new GoogleSheetsManufacturingSyncStateDataSource(
      sheetProvider,
    );

    repository = new ManufacturingSyncStateRepository(
      dataSource.getRows(),
      dataSource,
    );
  }

  return repository;
}
