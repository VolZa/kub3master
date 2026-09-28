/**
 * src/modules/bom/services/bom-products-audit.service.ts
 *
 * Модуль: BOM
 * Layer: Application
 *
 * Відповідальність:
 * - перевірка всіх Product у 00_Elements;
 * - збір попереджень BOM;
 * - формування зведеного результату аудиту.
 *
 * Сервіс не змінює дані.
 */

import { ElementRepository } from '../../elements/element.repository';
import { BOMCompletenessChecker, BOMWarning } from './bom-completeness-checker';
import {
  BOMRepairAnalysisResult,
  BOMRepairAnalyzer,
} from './bom-repair-analyzer';

export interface BOMProductAuditItem {
  productId: string;
  productCode: string;
  warnings: BOMWarning[];
}

export interface BOMProductsAuditResult {
  productsChecked: number;
  productsWithWarnings: number;
  warningsCount: number;
  items: BOMProductAuditItem[];

  repairAnalysis: BOMRepairAnalysisResult;
}

export class BOMProductsAuditService {
  constructor(
    private readonly elementRepository: ElementRepository,
    private readonly checker: BOMCompletenessChecker,
    private readonly repairAnalyzer: BOMRepairAnalyzer,
  ) {}

  public checkAllProducts(): BOMProductsAuditResult {
    const products = this.elementRepository.findByType('product');

    const items: BOMProductAuditItem[] = [];

    for (const product of products) {
      const warnings = this.checker.check(product.id);

      if (warnings.length > 0) {
        items.push({
          productId: product.id,
          productCode: product.code,
          warnings,
        });
      }
    }
    const repairAnalysis = this.repairAnalyzer.analyze(items);
    return {
      productsChecked: products.length,
      productsWithWarnings: items.length,
      warningsCount: items.reduce((sum, item) => sum + item.warnings.length, 0),
      items,
      repairAnalysis,
    };
  }
}
