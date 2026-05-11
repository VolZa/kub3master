import { CatalogItem } from './catalog.model';
import { ICatalogRepository } from './catalog.repository.interface';
import { mapRowsToCatalogItems } from './catalog.mapper';
import { validateCatalogItem } from './catalog.rules';

function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}

export class CatalogInMemoryRepository implements ICatalogRepository {
  private byCode = new Map<string, CatalogItem>();

  constructor(rows: any[][]) {
    const items = mapRowsToCatalogItems(rows);

    items.forEach((item) => {
      validateCatalogItem(item);

      const code = normalizeCode(item.code);

      if (this.byCode.has(code)) {
        throw new Error(`❌ Duplicate catalog code: ${code}`);
      }

      this.byCode.set(code, item);
    });
  }

  getByCode(code: string): CatalogItem | null {
    return this.byCode.get(normalizeCode(code)) || null;
  }

  requireByCode(code: string): CatalogItem {
    const item = this.getByCode(code);
    if (!item) {
      throw new Error(`❌ Catalog not found: ${code}`);
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

// import { CatalogItem } from './catalog.model';
// import { ICatalogRepository } from './catalog.repository.interface';
// import { mapRowsToCatalogItems } from './catalog.mapper';
// import { validateCatalogItem } from './catalog.rules';

// export class CatalogInMemoryRepository implements ICatalogRepository {
//   private byCode = new Map<string, CatalogItem>();

//   constructor(rows: any[][]) {
//     const items = mapRowsToCatalogItems(rows);

//     items.forEach((item) => {
//       validateCatalogItem(item);
//       this.byCode.set(item.code, item);
//     });
//   }

//   getByCode(code: string): CatalogItem | null {
//     return this.byCode.get(code) || null;
//   }

//   requireByCode(code: string): CatalogItem {
//     const item = this.getByCode(code);
//     if (!item) {
//       throw new Error(`❌ Catalog not found: ${code}`);
//     }
//     return item;
//   }
// }

// import { CatalogItem } from './catalog.model';
// import { mapRowsToCatalogItems } from './catalog.mapper';
// import { validateCatalogConsistency } from '@/domain/catalog/catalog.rules';

// export class CatalogRepository {
//   private byCode = new Map<string, CatalogItem>();

//   constructor(rows: any[][]) {
//     this.build(rows);
//   }

//   private build(rows: any[][]) {
//     const items = mapRowsToCatalogItems(rows);

//     items.forEach((item) => {
//       validateCatalogConsistency(item); // 🔥 винесли в domain
//       this.byCode.set(item.code, item);
//     });
//   }

//   getByCode(code: string): CatalogItem | null {
//     return this.byCode.get(code) || null;
//   }

//   requireByCode(code: string): CatalogItem {
//     const item = this.getByCode(code);

//     if (!item) {
//       throw new Error(`❌ Catalog not found: ${code}`);
//     }

//     return item;
//   }
// }
// export class CatalogRepository {
//   private byCode = new Map<string, CatalogItem>();

//   constructor(rows: any[][]) {
//     this.build(rows);
//   }

//   private build(rows: any[][]) {
//     const items = mapRowsToCatalogItems(rows);

//     items.forEach((item) => {
//       validateCatalogConsistency(item); // 🔥 винесли в domain
//       this.byCode.set(item.code, item);
//     });
//   }

//   getByCode(code: string): CatalogItem | null {
//     return this.byCode.get(code) || null;
//   }

//   requireByCode(code: string): CatalogItem {
//     const item = this.getByCode(code);

//     if (!item) {
//       throw new Error(`❌ Catalog not found: ${code}`);
//     }

//     return item;
//   }
// }
