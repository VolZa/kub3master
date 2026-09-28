/**
 * src/modules/bom/services/bom-repair-analyzer.ts
 *
 * Модуль: BOM
 * Layer: Application
 *
 * Відповідальність:
 * - аналіз попереджень BOMCompletenessChecker;
 * - визначення можливості безпечного відновлення;
 * - групування однакових проблем;
 * - підготовка плану подальшого відновлення.
 *
 * Сервіс не змінює дані.
 */

import { ElementRepository } from '../../elements/element.repository';
import { BOMWarning, BOMWarningType } from './bom-completeness-checker';

export type BOMRepairCategory =
  | 'SAFE_REPAIR'
  | 'NEEDS_SOURCE_DATA'
  | 'UNRESOLVED';

export interface BOMRepairCandidate {
  category: BOMRepairCategory;

  warningType: BOMWarningType;

  elementId: string;
  elementCode: string;

  materialId?: string;
  materialCode?: string;

  message: string;

  affectedProducts: string[];
}

export interface BOMRepairAnalysisResult {
  totalWarnings: number;

  safeRepairCount: number;
  needsSourceDataCount: number;
  unresolvedCount: number;

  candidates: BOMRepairCandidate[];
}

export class BOMRepairAnalyzer {
  constructor(private readonly elementRepository: ElementRepository) {}

  public analyze(
    warningsByProduct: readonly {
      productCode: string;
      warnings: readonly BOMWarning[];
    }[],
  ): BOMRepairAnalysisResult {
    const candidates = new Map<string, BOMRepairCandidate>();

    let totalWarnings = 0;

    for (const product of warningsByProduct) {
      for (const warning of product.warnings) {
        totalWarnings += 1;

        const candidate = this.createCandidate(warning, product.productCode);

        const key = this.buildCandidateKey(candidate);

        const existing = candidates.get(key);

        if (existing) {
          if (!existing.affectedProducts.includes(product.productCode)) {
            existing.affectedProducts.push(product.productCode);
          }

          continue;
        }

        candidates.set(key, candidate);
      }
    }

    const items = Array.from(candidates.values());

    return {
      totalWarnings,

      safeRepairCount: items.filter((item) => item.category === 'SAFE_REPAIR')
        .length,

      needsSourceDataCount: items.filter(
        (item) => item.category === 'NEEDS_SOURCE_DATA',
      ).length,

      unresolvedCount: items.filter((item) => item.category === 'UNRESOLVED')
        .length,

      candidates: items,
    };
  }

  private createCandidate(
    warning: BOMWarning,
    productCode: string,
  ): BOMRepairCandidate {
    switch (warning.type) {
      case 'PART_MATERIAL_MISSING':
        return this.createPartMaterialCandidate(warning, productCode);

      case 'ELEMENT_BOM_MISSING':
        return {
          category: 'NEEDS_SOURCE_DATA',
          warningType: warning.type,
          elementId: warning.elementId,
          elementCode: warning.elementCode,
          message: warning.message,
          affectedProducts: [productCode],
        };

      case 'ELEMENT_NOT_FOUND':
      case 'CATALOG_TEMPLATE_MISSING':
      default:
        return {
          category: 'UNRESOLVED',
          warningType: warning.type,
          elementId: warning.elementId,
          elementCode: warning.elementCode,
          message: warning.message,
          affectedProducts: [productCode],
        };
    }
  }

  private createPartMaterialCandidate(
    warning: BOMWarning,
    productCode: string,
  ): BOMRepairCandidate {
    const part = this.elementRepository.findById(warning.elementId);

    if (!part || !part.parentMaterialID) {
      return {
        category: 'UNRESOLVED',
        warningType: warning.type,
        elementId: warning.elementId,
        elementCode: warning.elementCode,
        message: warning.message,
        affectedProducts: [productCode],
      };
    }

    return {
      category: 'SAFE_REPAIR',
      warningType: warning.type,
      elementId: part.id,
      elementCode: part.code,
      materialId: String(part.parentMaterialID),
      materialCode: this.resolveMaterialCode(String(part.parentMaterialID)),
      message: warning.message,
      affectedProducts: [productCode],
    };
  }

  private resolveMaterialCode(materialId: string): string | undefined {
    return undefined;
  }

  private buildCandidateKey(candidate: BOMRepairCandidate): string {
    if (candidate.category === 'SAFE_REPAIR' && candidate.materialId) {
      return [
        candidate.warningType,
        candidate.elementId,
        candidate.materialId,
      ].join('|');
    }

    return [candidate.warningType, candidate.elementId].join('|');
  }
}
