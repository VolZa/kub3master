import { CatalogItem } from './catalog.model';

export interface ICatalogRepository {
  getByCode(code: string): CatalogItem | null;
  requireByCode(code: string): CatalogItem;
}
