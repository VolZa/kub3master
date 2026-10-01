/**
 * src/modules/reports/bom-vertical/bom-vertical-report.service.ts
 *
 * Модуль: Reports
 * Layer: Application
 *
 * Відповідальність:
 * - отримує розгорнутий BOM;
 * - перетворює BOMExpansionRow у рядки вертикального звіту;
 * - зберігає ієрархію BOM;
 * - не виконує повторної агрегації.
 */

import { BOMExpansionRow } from '../../bom/expansion/bom-expansion.row';

import { BOMVerticalReportRow } from './bom-vertical-report.model';

export class BOMVerticalReportService {
  /**
   * Формує вертикальний звіт із розгорнутого BOM.
   *
   * BOMExpansionService вже виконав:
   * - рекурсивне розгортання;
   * - розрахунок totalQty;
   * - перевірку циклів.
   *
   * Тому цей сервіс лише формує presentation-friendly rows.
   */
  public buildRows(rows: BOMExpansionRow[]): BOMVerticalReportRow[] {
    return rows.map((row) => ({
      level: row.level,

      parentId: row.parentId,
      parentCode: row.parentCode,

      elementId: row.elementId,
      code: row.elementCode,
      name: row.elementName,
      elementType: row.elementType,

      directQty: row.directQty,
      totalQty: row.totalQty,

      unit: row.unit,

      path: row.path,
    }));
  }
}
