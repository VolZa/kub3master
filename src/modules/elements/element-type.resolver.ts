/**
 * ==========================================================
 * ERP КУБ
 * Module: Elements
 * File: element-type.resolver.ts
 * Path: src/modules/elements/element-type.resolver.ts
 *
 * Визначає кінцевий тип елемента на основі шаблону Catalog
 * та наявності довжини.
 * ==========================================================
 */

import { CatalogItem } from '../catalog/catalog.model';
import { ElementType } from '../../config/config';

export function resolveElementType(
  template: CatalogItem,
  length?: number,
): ElementType {
  // Якщо шаблон підтримує довжину і вона задана —
  // створюється деталь (part)
  if (template.supportsLength && length !== undefined) {
    return 'part';
  }

  return template.type;
}

// /**
//  * ==========================================================
//  * ERP КУБ
//  * Module: Elements
//  * File: element-type.resolver.ts
//  * Path: src/modules/elements/element-type.resolver.ts
//  *
//  * Визначає кінцевий тип елемента на основі шаблону Catalog
//  * та властивостей BuiltElement.
//  * ==========================================================
//  */

// import { CatalogItem } from '../catalog/catalog.model';
// import { BuiltElement } from './element.builder';
// import { ElementType } from '../../config/config';

// export function resolveElementType(
//   template: CatalogItem,
//   built: BuiltElement,
// ): ElementType {
//   // Базовий тип із шаблону
//   let type = template.type;

//   // Матеріал із довжиною → деталь
//   if (
//     type === 'material' &&
//     template.supportsLength &&
//     built.length !== undefined
//   ) {
//     type = 'part';
//   }

//   return type;
// }
// import { CatalogItem } from '../catalog/catalog.model';
// import { BuiltElement } from './element.builder';

// export class ElementTypeResolver {
//   resolve(template: CatalogItem, built: BuiltElement): string {
//     let type = template.type;

//     if (
//       type === 'material' &&
//       template.supportsLength &&
//       built.length !== undefined
//     ) {
//       type = 'part';
//     }

//     return type;
//   }
// }
