// 📄 catalog
import { CatalogItem } from './catalog.model';
import {
  ELEMENT_TYPES,
  PRODUCTION_TYPES,
  PROFILE_TYPES,
} from '../../config/config';

// ------------------ helpers ------------------

function getCol(headers: any[], name: string): number {
  const index = headers.indexOf(name);
  if (index === -1) {
    throw new Error(`❌ Column not found: ${name}`);
  }
  return index;
}

function normalizeBoolean(value: any): boolean {
  return value === true || value === 'TRUE' || value === 1;
}

function normalizeString(value: any): string | undefined {
  if (!value) return undefined;
  const v = String(value).trim();
  return v === '' ? undefined : v;
}

// ------------------ mapper ------------------

export function mapRowsToCatalogItems(rows: any[][]): CatalogItem[] {
  const headers = rows[0];
  const data = rows.slice(1);

  const idx = {
    id: getCol(headers, 'ID'),
    typeCode: getCol(headers, 'TypeCode'),
    name: getCol(headers, 'Name'),
    type: getCol(headers, 'Type'),
    category: getCol(headers, 'Category'),
    profileType: getCol(headers, 'ProfileType'),
    hasBOM: getCol(headers, 'HasBOM'),
    productionType: getCol(headers, 'ProductionType'),
    supportsLength: getCol(headers, 'SupportsLength'),
    comment: getCol(headers, 'Comment'),
  };
  return data.map((row, i) => {
    const typeCode = normalizeString(row[idx.typeCode]);

    if (!typeCode) {
      throw new Error(`❌ Empty code at row ${i + 2}`);
    }

    const category = normalizeString(row[idx.category]);

    if (!category) {
      throw new Error(`❌ Missing category for TypeCode: ${typeCode}`);
    }

    return {
      id: Number(row[idx.id]),
      typeCode: String(row[idx.typeCode]).trim().toLowerCase(),
      name: String(row[idx.name] || '').trim(),

      type: row[idx.type],

      category, // 🔥 тепер гарантовано string

      profileType: normalizeString(row[idx.profileType]) as any,

      hasBOM: normalizeBoolean(row[idx.hasBOM]),

      productionType: row[idx.productionType],

      supportsLength: normalizeBoolean(row[idx.supportsLength]),

      comment: normalizeString(row[idx.comment]),
    };
  });
  // return data.map((row, i) => {
  //   const typeCode = normalizeString(row[idx.typeCode]);

  //   if (!typeCode) {
  //     throw new Error(`❌ Empty code at row ${i + 2}`);
  //   }

  //   return {
  //     id: Number(row[idx.id]),
  //     typeCode: String(row[idx.typeCode]).trim().toLowerCase(),
  //     name: String(row[idx.name] || '').trim(),

  //     type: row[idx.type], // далі можна строго типізувати

  //     category: normalizeString(row[idx.category]),

  //     profileType: normalizeString(row[idx.profileType]) as any,

  //     hasBOM: normalizeBoolean(row[idx.hasBOM]),

  //     productionType: row[idx.productionType],

  //     supportsLength: normalizeBoolean(row[idx.supportsLength]),

  //     comment: normalizeString(row[idx.comment]),
  //   };
  // });
}

// import { CatalogItem } from './catalog.model';

// export function mapRowsToCatalogItems(rows: any[][]): CatalogItem[] {
//   const headers = rows[0];
//   const data = rows.slice(1);

//   const col = (name: string) => headers.indexOf(name);

//   return data.map((row) => ({
//     id: Number(row[col('ID')]),
//     code: String(row[col('Code')]).trim(),
//     name: String(row[col('Name')]),
//     type: row[col('Type')],
//     category: row[col('Category')] || undefined,
//     // baseUnit: row[col('BaseUnit')],
//     profileType: row[col('ProfileType')] || undefined,
//     hasBOM: row[col('HasBOM')] === true,
//     productionType: row[col('ProductionType')],
//     comment: row[col('Comment')] || undefined,
//     // createdAt: new Date(row[col('CreatedAt')]),
//   }));
// }
