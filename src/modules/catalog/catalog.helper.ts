//src/modules/catalog/catalog.helper.ts
import { CatalogItem } from '../catalog/catalog.model';
import { ICatalogRepository } from '../catalog/catalog.repository.interface';
import {
  ElementType,
  MaterialCategory,
  ProfileType,
  ProductType,
} from '../../config/config';

export class CatalogHelper {
  constructor(private catalogRepo: ICatalogRepository) {}

  private normalize(prefixName: string): string {
    return prefixName.toLowerCase().trim();
  }

  // 🔥 базовий метод
  get(prefixName: string): CatalogItem {
    return this.catalogRepo.requireByCode(this.normalize(prefixName));
  }

  // 🔹 тип
  getType(prefixName: string): ElementType {
    return this.get(prefixName).type;
  }

  // 🔹 категорія
  getCategory(prefixName: string): ProductType | MaterialCategory | string {
    return this.get(prefixName).category;
  }

  // 🔹 profileType
  getProfileType(prefixName: string): ProfileType | undefined {
    return this.get(prefixName).profileType;
  }

  // 🔹 hasBOM
  hasBOM(prefixName: string): boolean {
    return this.get(prefixName).hasBOM;
  }

  // 🔹 productionType
  getProductionType(prefixName: string): string {
    return this.get(prefixName).productionType;
  }
}
