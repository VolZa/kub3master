import { ICatalogRepository } from './catalog.repository.interface';
import { CatalogItem } from './catalog.model';
// import { classifyRow } from '../bom/classification/classifyRow';
import { TableRowInput } from '../bom/model/table-row-input.model';

export class CatalogService {
  constructor(private repo: ICatalogRepository) {}

  // -------------------------------
  // 🔍 BASIC
  // -------------------------------

  getByCode(code: string): CatalogItem | null {
    return this.repo.getByCode(code);
  }

  findByTypeCode(typeCode: string): CatalogItem | null {
    return (
      this.items.find(
        (i) => i.typeCode.toLowerCase() === typeCode.toLowerCase(),
      ) || null
    );
  }
  requireByTypeCode(typeCode: string): CatalogItem {
    const item = this.findByTypeCode(typeCode);

    if (!item) {
      throw new Error(`Catalog item not found: ${typeCode}`);
    }

    if (!item.Category) {
      throw new Error(`Catalog missing Category: ${typeCode}`);
    }

    return item as Required<CatalogItem>;
  }
  // requireByCode(code: string): CatalogItem {
  //   return this.repo.requireByCode(code);
  // }

  // -------------------------------
  // 🔥 RESOLVE FROM ROW (через code)
  // -------------------------------

  // resolveFromRow(row: TableRowInput): CatalogItem {
  //   if (!row.codeEl) {
  //     throw new Error('Row has no code');
  //   }

  //   return this.requireByCode(row.codeEl);
  // }

  resolveFromRow(row: TableRowInput): CatalogItem {
    if (!row.prefix) {
      throw new Error('Row has no prefix');
    }

    const code = row.prefix.toLowerCase().trim();

    const item = this.repo.getByCode(code);

    if (!item) {
      throw new Error(`Catalog item not found: ${row.prefix}`);
    }

    return item;
  }

  // -------------------------------
  // 🔗 FIND OR FAIL (без classify)
  // -------------------------------

  resolveOrThrow(code: string): CatalogItem {
    return this.requireByCode(code);
  }
  // -------------------------------
  // 🔥 RESOLVE WITH CONTEXT
  // -------------------------------

  resolveWithContext(
    code: string,
    row: TableRowInput,
  ): {
    item: CatalogItem;
    resolvedType: 'material' | 'part' | 'assembly' | 'product';
  } {
    const item = this.requireByCode(code);

    let resolvedType = item.type;

    // 🔥 універсальна логіка
    if (item.supportsLength) {
      if (this.hasLength(row)) {
        resolvedType = 'part';
      } else {
        resolvedType = 'material';
      }
    }

    return { item, resolvedType };
  }

  private hasLength(row: TableRowInput): boolean {
    return row.length !== undefined && row.length > 0;
  }
}
