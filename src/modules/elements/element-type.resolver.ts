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
