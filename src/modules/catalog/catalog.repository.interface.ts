//src/modules/catalog/catalog.repository.interface.ts
import { CatalogItem } from './catalog.model';

// export interface ICatalogRepository {
//   getByCode(code: string): CatalogItem | null;
//   requireByCode(code: string): CatalogItem;
// }
export interface ICatalogRepository {
  getByTypeCode(typeCode: string): CatalogItem | null;

  requireByTypeCode(typeCode: string): CatalogItem;

  getByName(name: string): CatalogItem | null;

  requireByName(name: string): CatalogItem;

  getByType(type: string): CatalogItem[];

  getAll(): CatalogItem[];
}
