/**
 * src/modules/bom/tests/bom-products-audit.test.ts
 *
 * Модуль: BOM
 * Layer: Integration Test
 *
 * Відповідальність:
 * - перевірка всіх Product з 00_Elements;
 * - запуск BOMCompletenessChecker для кожного Product;
 * - формування зведеного звіту.
 *
 * Тест не змінює дані Google Sheets.
 */

import { GoogleSheetsElementRepository } from '../../elements/element.repository';
import { getMaterialRepository } from '../../../app/factories/material.factory';
import { getCatalogRepository } from '../../../app/factories/catalog.factory';

import { CatalogHelper } from '../../catalog/catalog.helper';

import { BOMCompletenessChecker } from '../services/bom-completeness-checker';

import { BOMProductsAuditService } from '../services/bom-products-audit.service';

// import { getChildrenRows, getParentsRows } from '../bom.repository';
import { getAllBOMRows } from '../bom.repository';
import { BOMRepairAnalyzer } from '../services/bom-repair-analyzer';

export function testAuditAllProducts(): void {
  console.log('========================================');
  console.log('TEST: BOM PRODUCTS AUDIT');
  console.log('========================================');

  const elementRepository = new GoogleSheetsElementRepository();

  const materialRepository = getMaterialRepository();

  const catalogRepository = getCatalogRepository();

  const catalogHelper = new CatalogHelper(catalogRepository);

  // ---------------------------------------------------------
  // Адаптер фізичного BOM repository
  // ---------------------------------------------------------

  // ---------------------------------------------------------
  // BOM завантажуємо один раз у пам'ять.
  // ---------------------------------------------------------

  const allBOMRows = getAllBOMRows();

  const bomRepository = {
    getChildrenRows(parentId: string) {
      return allBOMRows.filter((row) => row.parentId === String(parentId));
    },

    getParentsRows(childId: string) {
      return allBOMRows.filter((row) => row.childId === String(childId));
    },
  };

  // ---------------------------------------------------------
  // Checker одного BOM
  // ---------------------------------------------------------

  const checker = new BOMCompletenessChecker(
    elementRepository,
    materialRepository,
    bomRepository,
    catalogHelper,
  );

  // ---------------------------------------------------------
  // Аудит усіх Product
  // ---------------------------------------------------------
  const repairAnalyzer = new BOMRepairAnalyzer(elementRepository);
  const auditService = new BOMProductsAuditService(
    elementRepository,
    checker,
    repairAnalyzer,
  );

  const result = auditService.checkAllProducts();
  console.log('');
  console.log('=== REPAIR ANALYSIS ===');

  console.log(`Total warnings: ${result.repairAnalysis.totalWarnings}`);

  console.log(`SAFE_REPAIR: ${result.repairAnalysis.safeRepairCount}`);

  console.log(
    `NEEDS_SOURCE_DATA: ${result.repairAnalysis.needsSourceDataCount}`,
  );

  console.log(`UNRESOLVED: ${result.repairAnalysis.unresolvedCount}`);

  //Деталі
  console.log('');
  console.log('=== REPAIR CANDIDATES ===');

  for (const candidate of result.repairAnalysis.candidates) {
    console.log('');
    console.log(`🔧 [${candidate.category}] ` + `${candidate.elementCode}`);

    if (candidate.materialId) {
      console.log(`   MaterialID: ${candidate.materialId}`);
    }

    console.log(
      `   Affected products: ` + `${candidate.affectedProducts.join(', ')}`,
    );
  }
  // ---------------------------------------------------------
  // SUMMARY
  // ---------------------------------------------------------

  console.log('');
  console.log('=== SUMMARY ===');

  console.log(`Products checked: ${result.productsChecked}`);

  console.log(`Products with warnings: ${result.productsWithWarnings}`);

  console.log(`Warnings: ${result.warningsCount}`);

  // ---------------------------------------------------------
  // Деталі
  // ---------------------------------------------------------

  if (result.items.length === 0) {
    console.log('');
    console.log('✅ Усі Product пройшли перевірку BOM.');

    return;
  }

  console.log('');
  console.log('=== PRODUCTS WITH WARNINGS ===');

  for (const item of result.items) {
    console.log('');
    console.log(`🔹 ${item.productCode} [${item.productId}]`);

    for (const warning of item.warnings) {
      console.log(`  ⚠️ [${warning.type}] ${warning.message}`);

      console.log(`     PATH: ${warning.path.join(' → ')}`);
    }
  }

  console.log('');
  console.log('=== END BOM PRODUCTS AUDIT ===');
}
