import { CatalogItem } from './catalog.model';
import { CatalogRow } from '../catalog/catalog.row';
import { ICatalogRepository } from './catalog.repository.interface';
import { mapRowsToCatalogItems } from './catalog.mapper';
import { normalize } from 'utils/normalize';

function normalizeCode(code: string): string {
  return code.trim().toLowerCase();
}

export class CatalogInMemoryRepository implements ICatalogRepository {
  // private byCode = new Map<string, CatalogItem>();
  private byTypeCode = new Map<string, CatalogItem>();

  private byName = new Map<string, CatalogItem>();

  constructor(rows: readonly CatalogRow[]) {
    const items = mapRowsToCatalogItems(rows);

    //   items.forEach((item) => {
    //     // validateCatalogItem(item); // 🔥 тепер передаємо тип для більш контекстної валідації
    //     // 🔥 тільки базова перевірка (без resolvedType)
    //     if (!item.typeCode) {
    //       throw new Error(`❌ typeCode is required`);
    //     }

    //     const typeCode = normalizeCode(item.typeCode);
    //     if (this.byTypeCode.has(typeCode)) {
    //       throw new Error(`❌ Duplicate catalog code: ${typeCode}`);
    //     }

    //     this.byTypeCode.set(typeCode, item);
    //   });

    items.forEach((item) => {
      const typeCode = normalize(item.typeCode);
      const name = normalize(item.name);

      if (this.byTypeCode.has(typeCode)) {
        throw new Error(`❌ Duplicate catalog TypeCode: ${item.typeCode}`);
      }

      if (this.byName.has(name)) {
        throw new Error(`❌ Duplicate catalog Name: ${item.name}`);
      }

      this.byTypeCode.set(typeCode, item);
      this.byName.set(name, item);
    });
  }

  //   getByTypeCode(typeCode: string): CatalogItem | null {
  //     return this.byTypeCode.get(normalizeCode(typeCode)) || null;
  //   }

  //   requireByTypeCode(typeCode: string): CatalogItem {
  //     const item = this.byTypeCode.get(normalizeCode(typeCode));

  //     if (!item) {
  //       throw new Error(`Catalog item not found: ${typeCode}`);
  //     }

  //     return item;
  //   }

  getAll(): CatalogItem[] {
    return Array.from(this.byTypeCode.values());
  }

  getByType(type: string): CatalogItem[] {
    return this.getAll().filter((i) => i.type === type);
  }

  getByTypeCode(typeCode: string): CatalogItem | null {
    return this.byTypeCode.get(normalize(typeCode)) ?? null;
  }

  requireByTypeCode(typeCode: string): CatalogItem {
    const item = this.getByTypeCode(typeCode);

    if (!item) {
      throw new Error(`Catalog TypeCode not found: ${typeCode}`);
    }

    return item;
  }

  getByName(name: string): CatalogItem | null {
    return this.byName.get(normalize(name)) ?? null;
  }

  requireByName(name: string): CatalogItem {
    const item = this.getByName(name);

    if (!item) {
      throw new Error(`Catalog Name not found: ${name}`);
    }

    return item;
  }
}
