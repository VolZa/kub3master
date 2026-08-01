import { CatalogItem } from './catalog.model';
import { CatalogRow } from '../catalog/catalog.row';
import { ICatalogRepository } from './catalog.repository.interface';
import { mapRowsToCatalogItems } from './catalog.mapper';

function normalizeCode(code: string): string {
  return code.trim().toLowerCase();
}

export class CatalogInMemoryRepository implements ICatalogRepository {
  private byCode = new Map<string, CatalogItem>();

  constructor(rows: readonly CatalogRow[]) {
    const items = mapRowsToCatalogItems(rows);

    items.forEach((item) => {
      // validateCatalogItem(item); // 🔥 тепер передаємо тип для більш контекстної валідації
      // 🔥 тільки базова перевірка (без resolvedType)
      if (!item.typeCode) {
        throw new Error(`❌ typeCode is required`);
      }

      const typeCode = normalizeCode(item.typeCode);
      if (this.byCode.has(typeCode)) {
        throw new Error(`❌ Duplicate catalog code: ${typeCode}`);
      }

      this.byCode.set(typeCode, item);
    });
  }

  getByCode(code: string): CatalogItem | null {
    return this.byCode.get(normalizeCode(code)) || null;
  }

  // requireByCode(code: string): CatalogItem {
  //   const item = this.getByCode(code);
  //   if (!item) {
  //     throw new Error(`❌ Catalog not found: ${code}`);
  //   }
  //   return item;
  // }
  requireByCode(typeCode: string): CatalogItem {
    const item = this.byCode.get(normalizeCode(typeCode));

    if (!item) {
      throw new Error(`Catalog item not found: ${typeCode}`);
    }

    return item;
  }

  getAll(): CatalogItem[] {
    return Array.from(this.byCode.values());
  }

  getByType(type: string): CatalogItem[] {
    return this.getAll().filter((i) => i.type === type);
  }
}
