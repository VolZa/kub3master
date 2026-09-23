// src/modules/catalog/catalog.helper.ts

import { normalize } from '../../utils/normalize';
import { CatalogItem } from './catalog.model';
import { ICatalogRepository } from './catalog.repository.interface';

export class CatalogHelper {
  constructor(private readonly catalogRepo: ICatalogRepository) {}

  /**
   * Повертає шаблон елемента за його префіксом.
   *
   * Приклад:
   *   "Плита міжколонна"   -> шаблон "плита"
   *   "Каркас просторовий" -> шаблон "каркас"
   *   "Стержень гнутий"    -> шаблон "стержень"
   */
  public resolveTemplate(prefixName: string): CatalogItem {
    const words = normalize(prefixName).split(/\s+/);

    const template = this.catalogRepo
      .getAll()
      .find((item) => words.includes(normalize(item.typeCode)));

    if (!template) {
      throw new Error(`Catalog template not found for prefix: "${prefixName}"`);
    }

    return template;
  }

  // ===== Тимчасово залишаємо старі методи =====

  getType(prefixName: string) {
    return this.resolveTemplate(prefixName).type;
  }

  getCategory(prefixName: string) {
    return this.resolveTemplate(prefixName).category;
  }

  getProfileType(prefixName: string) {
    return this.resolveTemplate(prefixName).profileType;
  }

  hasBOM(prefixName: string) {
    return this.resolveTemplate(prefixName).hasBOM;
  }

  getProductionType(prefixName: string) {
    return this.resolveTemplate(prefixName).productionType;
  }
}
