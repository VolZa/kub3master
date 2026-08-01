// src\modules\catalog\catalog.row.ts
export interface CatalogRow {
  ID: string;
  TypeCode: string;
  Name: string;

  Type: string;
  Category: string;
  ProfileType?: string;

  HasBOM: string;
  ProductionType: string;
  SupportsLength: string;

  Comment?: string;
}
