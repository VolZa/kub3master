import { CatalogInMemoryRepository } from '../../modules/catalog/catalog.repository';
import { GoogleSheetsCatalogDataSource } from '../../infrastructure/sheets/catalog/GoogleSheetsCatalogDataSource';

let instance: CatalogInMemoryRepository | null = null;

export function getCatalogRepository(): CatalogInMemoryRepository {
  if (!instance) {
    const ds = new GoogleSheetsCatalogDataSource();
    const rows = ds.getRows();

    instance = new CatalogInMemoryRepository(rows);
  }

  return instance;
}
