import { ICatalogRepository } from './catalog.repository.interface';
import { CatalogItem } from './catalog.model';
// import { classifyRow } from '../bom/classification/classifyRow';
import { TableRowInput } from '../bom/model/table-row-input.model';

// export class CatalogService {
//   constructor(private repo: ICatalogRepository) {}

//   // -------------------------------
//   // 🔍 BASIC
//   // -------------------------------

//   getByCode(code: string): CatalogItem | null {
//     return this.repo.getByCode(code);
//   }

//   requireByCode(code: string): CatalogItem {
//     return this.repo.requireByCode(code);
//   }

//   // -------------------------------
//   // 🔥 CORE: RESOLVE FROM INPUT
//   // -------------------------------

//   resolveFromRow(row: TableRowInput): {
//     type: string;
//     category?: string;
//     profileType?: string;
//   } {
//     const classified = classifyRow(row);

//     return {
//       type: classified.type,
//       category: classified.category,
//       profileType: classified.profileType,
//     };
//   }

//   // -------------------------------
//   // 🔗 OPTIONAL: FIND OR CLASSIFY
//   // -------------------------------

//   resolveOrClassify(
//     code: string,
//     row: TableRowInput,
//   ):
//     | CatalogItem
//     | {
//         type: string;
//         category?: string;
//         profileType?: string;
//       } {
//     const existing = this.repo.getByCode(code);

//     if (existing) {
//       return existing;
//     }

//     // fallback
//     return this.resolveFromRow(row);
//   }
// }

export class CatalogService {
  constructor(private repo: ICatalogRepository) {}

  // -------------------------------
  // 🔍 BASIC
  // -------------------------------

  getByCode(code: string): CatalogItem | null {
    return this.repo.getByCode(code);
  }

  requireByCode(code: string): CatalogItem {
    return this.repo.requireByCode(code);
  }

  // -------------------------------
  // 🔥 RESOLVE FROM ROW (через code)
  // -------------------------------

  resolveFromRow(row: TableRowInput): CatalogItem {
    if (!row.codeEl) {
      throw new Error('Row has no code');
    }

    return this.requireByCode(row.codeEl);
  }

  // -------------------------------
  // 🔗 FIND OR FAIL (без classify)
  // -------------------------------

  resolveOrThrow(code: string): CatalogItem {
    return this.requireByCode(code);
  }
}
