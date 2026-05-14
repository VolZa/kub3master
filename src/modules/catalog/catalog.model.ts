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
  category?: ProductType | MaterialCategory | string; // 🔥 НОРМАЛІЗАЦІЯ
  profileType?: ProfileType;

  hasBOM: boolean;
  productionType: ProductionType;
  supportsLength: boolean;

  comment?: string;
}
