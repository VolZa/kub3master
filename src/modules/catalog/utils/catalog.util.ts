//src\modules\catalog\utils\catalog.util.ts
import { CatalogItem } from '../../catalog/catalog.model';
import { ICatalogRepository } from '../catalog.repository.interface';

export function getCatalogByPrefix(
  prefixName: string,
  catalogRepo: ICatalogRepository,
): CatalogItem {
  return catalogRepo.requireByCode(prefixName.toLowerCase().trim());
}
export function getCategoryByPrefix(
  prefixName: string,
  catalogRepo: ICatalogRepository,
): string {
  return getCatalogByPrefix(prefixName, catalogRepo).category;
}

export function getTypeByPrefix(
  prefixName: string,
  catalogRepo: ICatalogRepository,
): string {
  return getCatalogByPrefix(prefixName, catalogRepo).type;
}
