/**
 * src/modules/reports/bom-vertical/bom-vertical-report.service.test.ts
 *
 * Модуль: Reports
 * Layer: Test
 *
 * Перевіряє:
 * - формування вертикального BOM-звіту;
 * - збереження ієрархії;
 * - збереження directQty;
 * - збереження totalQty;
 * - відсутність агрегації однакових елементів,
 *   якщо вони знаходяться в різних гілках BOM.
 */

import { BOMExpansionService } from '../../bom/expansion/bom-expansion.service';
import { BOMVerticalReportService } from './bom-vertical-report.service';

import { getBOMRepository } from '../../../app/factories/bom.factory';
import { getElementRepository } from '../../../app/factories/element.factory';
import { getMaterialRepository } from '../../../app/factories';

export function testBOMVerticalReportP31(): void {
  // ------------------------------------------------------------
  // Створюємо реальні залежності
  // ------------------------------------------------------------

  const bomRepository = getBOMRepository();
  const elementRepository = getElementRepository();
  const materialRepository = getMaterialRepository();

  const bomExpansionService = new BOMExpansionService(
    bomRepository,
    elementRepository,
    materialRepository,
  );

  const reportService = new BOMVerticalReportService();

  // ------------------------------------------------------------
  // Отримуємо реальний розгорнутий BOM П-3.1
  // ------------------------------------------------------------

  const expansion = bomExpansionService.expandProduct('2027');

  console.log(`BOM Expansion: ${expansion.length} rows`);

  // ------------------------------------------------------------
  // Формуємо вертикальний звіт
  // ------------------------------------------------------------

  const rows = reportService.buildRows(expansion);

  console.log(`BOM Vertical Report: ${rows.length} rows`);

  // ------------------------------------------------------------
  // Загальна кількість
  // ------------------------------------------------------------

  if (rows.length !== 27) {
    throw new Error(`Expected 27 report rows, got ${rows.length}`);
  }

  // ------------------------------------------------------------
  // Контроль першого рівня
  // ------------------------------------------------------------

  const vsp = rows.find((row) => row.code === 'ВСП-П-3.1' && row.level === 1);

  if (!vsp) {
    throw new Error('ВСП-П-3.1 L1 row not found');
  }

  if (vsp.directQty !== 1) {
    throw new Error(`Expected ВСП-П-3.1 directQty = 1, got ${vsp.directQty}`);
  }

  if (vsp.totalQty !== 1) {
    throw new Error(`Expected ВСП-П-3.1 totalQty = 1, got ${vsp.totalQty}`);
  }

  // ------------------------------------------------------------
  // Контроль другого рівня
  // ------------------------------------------------------------

  const r4 = rows.find(
    (row) => row.code === 'R_4_BP-1_L2960' && row.parentCode === 'ВСП-П-3.1',
  );

  if (!r4) {
    throw new Error('R_4_BP-1_L2960 under ВСП-П-3.1 not found');
  }

  if (r4.level !== 2) {
    throw new Error(`Expected R_4_BP-1_L2960 level = 2, got ${r4.level}`);
  }

  if (r4.directQty !== 14) {
    throw new Error(
      `Expected R_4_BP-1_L2960 directQty = 14, got ${r4.directQty}`,
    );
  }

  if (r4.totalQty !== 14) {
    throw new Error(
      `Expected R_4_BP-1_L2960 totalQty = 14, got ${r4.totalQty}`,
    );
  }

  // ------------------------------------------------------------
  // Контроль третього рівня
  // ------------------------------------------------------------

  const material = rows.find(
    (row) => row.code === 'R_4_BP-1' && row.parentCode === 'R_4_BP-1_L2960',
  );

  if (!material) {
    throw new Error('R_4_BP-1 under R_4_BP-1_L2960 not found');
  }

  if (material.level !== 3) {
    throw new Error(`Expected R_4_BP-1 level = 3, got ${material.level}`);
  }

  if (material.directQty !== 0.29) {
    throw new Error(
      `Expected R_4_BP-1 directQty = 0.29, got ${material.directQty}`,
    );
  }

  if (material.totalQty !== 4.06) {
    throw new Error(
      `Expected R_4_BP-1 totalQty = 4.06, got ${material.totalQty}`,
    );
  }

  // ------------------------------------------------------------
  // Контроль повторного використання деталі
  // ------------------------------------------------------------
  //
  // R_12_A500C_L800 входить:
  //
  // ГС-2 → 34 шт
  // ГС-3 → 10 шт
  //
  // Ці два рядки НЕ повинні бути об'єднані.
  // ------------------------------------------------------------

  const r12Rows = rows.filter((row) => row.code === 'R_12_A500C_L800');

  if (r12Rows.length !== 2) {
    throw new Error(`Expected 2 R_12_A500C_L800 rows, got ${r12Rows.length}`);
  }

  const gs2Row = r12Rows.find((row) => row.parentCode === 'ГС-2');

  if (!gs2Row) {
    throw new Error('R_12_A500C_L800 under ГС-2 not found');
  }

  if (gs2Row.directQty !== 1) {
    throw new Error(`Expected ГС-2 directQty = 1, got ${gs2Row.directQty}`);
  }

  if (gs2Row.totalQty !== 34) {
    throw new Error(`Expected ГС-2 totalQty = 34, got ${gs2Row.totalQty}`);
  }

  const gs3Row = r12Rows.find((row) => row.parentCode === 'ГС-3');

  if (!gs3Row) {
    throw new Error('R_12_A500C_L800 under ГС-3 not found');
  }

  if (gs3Row.directQty !== 1) {
    throw new Error(`Expected ГС-3 directQty = 1, got ${gs3Row.directQty}`);
  }

  if (gs3Row.totalQty !== 10) {
    throw new Error(`Expected ГС-3 totalQty = 10, got ${gs3Row.totalQty}`);
  }

  // ------------------------------------------------------------
  // Контроль path
  // ------------------------------------------------------------

  const expectedPath = ['2027', '2012', '4013'];

  if (
    gs2Row.path.length !== expectedPath.length ||
    !gs2Row.path.every((value, index) => value === expectedPath[index])
  ) {
    throw new Error(
      `Unexpected path for R_12_A500C_L800 under ГС-2: ` +
        `${gs2Row.path.join(' → ')}`,
    );
  }

  // ------------------------------------------------------------
  // Вивід
  // ------------------------------------------------------------

  for (const row of rows) {
    console.log(
      `L${row.level} | ` +
        `${row.parentCode} → ${row.code} | ` +
        `direct=${row.directQty} | ` +
        `total=${row.totalQty} | ` +
        `${row.unit} | ` +
        `path=${row.path.join(' → ')}`,
    );
  }

  console.log('✓ testBOMVerticalReportP31 passed');
}
