//src/modules/catalog/catalog.model.ts
import {
  ElementType,
  ProfileType,
  ProductType,
  MaterialCategory,
  ProductionType,
} from '../../config/config';

export interface CatalogItem {
  id: number;
  typeCode: string;
  name: string;

  type: ElementType;
  category: ProductType | MaterialCategory | string; // 🔥 НОРМАЛІЗАЦІЯ
  profileType?: ProfileType;

  hasBOM: boolean;
  productionType: ProductionType;
  supportsLength: boolean;

  comment?: string;
}

//Додано для роботи з Google Sheets ПЕРЕВІРИТИ
export interface CatalogRow {
  ID: string;
  TypeCode: string;
  Name: string;
  Type: string;
  Category: string;
  ProfileType?: string;
}

export interface Catalog {
  id: string;
  code: string;
  name: string;
  type: ElementType;
  category: ProductType | MaterialCategory | string; // 🔥 НОРМАЛІЗАЦІЯ
  profileType?: ProfileType;
}
//================================
