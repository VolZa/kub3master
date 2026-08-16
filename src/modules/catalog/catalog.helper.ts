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

//src/modules/catalog/catalog.helper.ts
// import { CatalogItem } from '../catalog/catalog.model';
// import { ICatalogRepository } from '../catalog/catalog.repository.interface';
// import {
//   ElementType,
//   MaterialCategory,
//   ProfileType,
//   ProductType,
// } from '../../config/config';
// import { normalize } from 'utils/normalize';

// export class CatalogHelper {
//   constructor(private catalogRepo: ICatalogRepository) {}

//   // private normalize(prefixName: string): string {
//   //   return prefixName.toLowerCase().trim();
//   // }

//   // 🔥 базовий метод
//   get(prefixName: string): CatalogItem {
//     // return this.catalogRepo.requireByCode(this.normalize(prefixName));
//     return this.catalogRepo.requireByName(prefixName);
//   }

//   // 🔹 тип
//   getType(prefixName: string): ElementType {
//     return this.get(prefixName).type;
//   }

//   // 🔹 категорія
//   getCategory(prefixName: string): ProductType | MaterialCategory | string {
//     return this.get(prefixName).category;
//   }

//   // 🔹 profileType
//   getProfileType(prefixName: string): ProfileType | undefined {
//     return this.get(prefixName).profileType;
//   }

//   // 🔹 hasBOM
//   hasBOM(prefixName: string): boolean {
//     return this.get(prefixName).hasBOM;
//   }

//   // 🔹 productionType
//   getProductionType(prefixName: string): string {
//     return this.get(prefixName).productionType;
//   }

//   /**
//    * Повертає шаблон елемента за його префіксом.
//    */
//   // resolveTemplate(prefixName: string): CatalogItem;
//   private tokenize(text: string): string[] {
//     return normalize(text).split(/\s+/);
//   }

//   resolveTemplate(prefixName: string): CatalogItem {
//     const words = this.tokenize(prefixName);

//     const template = this.catalogRepo
//       .getAll()
//       .find((item) => words.includes(normalize(item.typeCode)));

//     if (!template) {
//       throw new Error(`Catalog template not found for prefix: ${prefixName}`);
//     }

//     return template;
//   }
// }
