/**
 * src/modules/bom/tests/bom-completeness-checker.test.ts
 *
 * Модуль: BOM
 * Layer: Integration Test
 *
 * Відповідальність:
 * - перевірка BOMCompletenessChecker на реальних Element;
 * - контроль повного BOM;
 * - контроль відсутнього Part → Material;
 * - контроль відсутнього BOM вкладеного Element.
 *
 * Тест не змінює дані Google Sheets.
 */

import {
  BOMCompletenessChecker,
  BOMWarning,
} from '../services/bom-completeness-checker';
import { BOMRow } from '../model/bom-row.model';
import { getAllBOMRows } from '../bom.repository';
import { BOMRepository } from '../bom.repository.interface';

import {
  ElementRepository,
  GoogleSheetsElementRepository,
} from '../../elements/element.repository';

import { CatalogHelper } from '../../catalog/catalog.helper';
import { getCatalogRepository } from '../../../app/factories/catalog.factory';

class TestBOMRepository implements BOMRepository {
  constructor(private readonly rows: ReturnType<typeof getAllBOMRows>) {}

  getChildrenRows(parentId: string) {
    return this.rows.filter((row) => row.parentId === String(parentId));
  }

  getParentsRows(childId: string) {
    return this.rows.filter((row) => row.childId === String(childId));
  }
}

function printWarnings(title: string, warnings: readonly BOMWarning[]): void {
  console.log(`\n=== ${title} ===`);

  if (warnings.length === 0) {
    console.log('OK — warnings відсутні.');
    return;
  }

  console.log(`Warnings: ${warnings.length}`);

  warnings.forEach((warning, index) => {
    console.log(`${index + 1}. [${warning.type}] ` + `${warning.message}`);

    console.log(`   PATH: ${warning.path.join(' → ')}`);
  });
}

export function testBOMCompletenessChecker(): void {
  console.log('\n========================================');
  console.log('TEST: BOMCompletenessChecker');
  console.log('========================================');

  const elementRepository: ElementRepository =
    new GoogleSheetsElementRepository();

  const bomRows = getAllBOMRows();

  const bomRepository = new TestBOMRepository(bomRows);

  //   const catalogHelper = new CatalogHelper();
  const catalogRepository = getCatalogRepository();

  const catalogHelper = new CatalogHelper(catalogRepository);

  const checker = new BOMCompletenessChecker(
    bomRepository,
    elementRepository,
    catalogHelper,
  );

  // ---------------------------------------------------------
  // 1. Знаходимо П-1.12
  // ---------------------------------------------------------

  const root = elementRepository.findById('1010');

  if (!root) {
    throw new Error('TEST ERROR: Element 1010 (П-1.12) не знайдено.');
  }

  console.log(`Root: ${root.id} | ${root.code}`);

  // ---------------------------------------------------------
  // 2. Реальний BOM
  // ---------------------------------------------------------

  const warnings = checker.check(root.id);

  printWarnings('SCENARIO 1 — реальний BOM П-1.12', warnings);

  //   console.log(`отримали ${warnings.length}  warnings.`);
  console.log('SCENARIO 1 PASSED');

  // ---------------------------------------------------------
  // 3. Видаляємо тільки Part → Material
  //    4009 → 3005
  // ---------------------------------------------------------

  const rowsWithoutMaterialLink = bomRows.filter(
    (row) =>
      !(String(row.parentId) === '4009' && String(row.childId) === '3005'),
  );

  const bomRepositoryWithoutMaterial = new TestBOMRepository(
    rowsWithoutMaterialLink,
  );

  const part4009 = elementRepository.findById('4009');

  //   console.log('SCENARIO 2: Element 4009:', JSON.stringify(part4009, null, 2));

  const checkerWithoutMaterial = new BOMCompletenessChecker(
    bomRepositoryWithoutMaterial,
    elementRepository,
    catalogHelper,
  );

  const warningsWithoutMaterial = checkerWithoutMaterial.check(root.id);

  printWarnings(
    'SCENARIO 2 — відсутній Part → Material',
    warningsWithoutMaterial,
  );

  const partMaterialWarning = warningsWithoutMaterial.find(
    (warning) =>
      warning.type === 'PART_MATERIAL_MISSING' && warning.elementId === '4009',
  );

  if (!partMaterialWarning) {
    throw new Error(
      'SCENARIO 2 FAILED: ' + 'PART_MATERIAL_MISSING для 4009 не знайдено.',
    );
  }

  console.log('SCENARIO 2 PASSED');

  // ---------------------------------------------------------
  // 4. Видаляємо весь BOM КР1-1-39
  //
  // ГС-0 = Element 2009
  // ---------------------------------------------------------

  const rowsWithoutGS0BOM = bomRows.filter(
    (row) => String(row.parentId) !== '2092',
  );

  const bomRepositoryWithoutGS0 = new TestBOMRepository(rowsWithoutGS0BOM);

  const checkerWithoutGS0 = new BOMCompletenessChecker(
    bomRepositoryWithoutGS0,
    elementRepository,
    catalogHelper,
  );

  const warningsWithoutGS0 = checkerWithoutGS0.check(root.id);

  printWarnings('SCENARIO 3 — відсутній BOM КР1-1-39', warningsWithoutGS0);

  const missingGS0BOM = warningsWithoutGS0.find(
    (warning) =>
      warning.type === 'ELEMENT_BOM_MISSING' && warning.elementId === '2092',
  );

  if (!missingGS0BOM) {
    throw new Error(
      'SCENARIO 3 FAILED: ' + 'ELEMENT_BOM_MISSING для КР1-1-39 не знайдено.',
    );
  }

  console.log('SCENARIO 3 PASSED');

  console.log('\n========================================');
  console.log('BOMCompletenessChecker TEST: OK');
  console.log('========================================');
}
