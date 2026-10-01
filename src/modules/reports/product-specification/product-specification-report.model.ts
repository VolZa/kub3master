// src/modules/reports/product-specification/product-specification-report.model.ts

/**
 * Модуль: Reports
 * Layer: Domain
 *
 * Відповідальність:
 * - описує готовий звіт зведеної специфікації Product.
 */

import { ProductSpecificationRow } from '../../bom/specification/product-specification.model';

export interface ProductSpecificationReport {
  productId: string;
  productCode: string;

  assemblies: ProductSpecificationRow[];
  parts: ProductSpecificationRow[];
  materials: ProductSpecificationRow[];

  totalRows: number;
}
