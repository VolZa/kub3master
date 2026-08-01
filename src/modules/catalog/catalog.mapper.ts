//==============================================================================
// Module: Catalog
// File: src/modules/catalog/catalog.mapper.ts
// Призначення:
//   Перетворення CatalogRow ⇄ CatalogItem.
//==============================================================================

import {
  ElementType,
  MaterialCategory,
  ProductType,
  ProductionType,
  ProfileType,
} from '../../config/config';

import { CatalogItem } from './catalog.model';
import { CatalogRow } from './catalog.row';

//---------------------------------------------------------
// helpers
//---------------------------------------------------------

function normalizeBoolean(value: unknown): boolean {
  return value === true || value === 'TRUE' || value === 1;
}

function normalizeString(value: unknown): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  const str = String(value).trim();
  return str === '' ? undefined : str;
}

//---------------------------------------------------------
// Row -> Domain
//---------------------------------------------------------

export function mapRowsToCatalogItems(
  rows: readonly CatalogRow[],
): CatalogItem[] {
  return rows.map((row) => ({
    id: Number(row.ID),

    typeCode: row.TypeCode.trim().toLowerCase(),

    name: row.Name.trim(),

    type: row.Type as ElementType,

    category: row.Category as ProductType | MaterialCategory,

    profileType: normalizeString(row.ProfileType) as ProfileType | undefined,

    hasBOM: normalizeBoolean(row.HasBOM),

    productionType: row.ProductionType as ProductionType,

    supportsLength: normalizeBoolean(row.SupportsLength),

    comment: normalizeString(row.Comment),
  }));
}
