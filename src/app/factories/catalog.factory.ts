import { CatalogInMemoryRepository } from '../../modules/catalog/catalog.repository';
// import { CatalogRepository } from '../../infrastructure/sheets/catalog/GoogleSheetsCatalogDataSource';
import { GoogleSheetsCatalogDataSource } from '../../infrastructure/sheets/catalog/GoogleSheetsCatalogDataSource';

import { sheetProvider } from './infrastructure.factory';

let repository: CatalogInMemoryRepository | null = null;

export function getCatalogRepository(): CatalogInMemoryRepository {
  if (!repository) {
    const dataSource = new GoogleSheetsCatalogDataSource(sheetProvider);

    repository = new CatalogInMemoryRepository(dataSource.getRows());
  }

  return repository;
}
