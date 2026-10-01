// src/modules/bom/specification/product-specification.model.ts
//
// Модуль: BOM
// Layer: Domain
// Відповідальність: зведена специфікація виробу

import { ElementType } from '../../../config/config';

export interface ProductSpecificationRow {
  elementId: string;
  code: string;
  name: string;
  elementType: ElementType;
  qty: number;
  unit: string;
}

export interface ProductSpecification {
  productId: string;
  productCode: string;

  assemblies: ProductSpecificationRow[];
  parts: ProductSpecificationRow[];
  materials: ProductSpecificationRow[];
}
