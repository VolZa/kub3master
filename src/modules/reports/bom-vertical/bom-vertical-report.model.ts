/**
 * src/modules/reports/bom-vertical/bom-vertical-report.model.ts
 *
 * Модуль: Reports
 * Layer: Domain
 *
 * Відповідальність:
 * - описує один рядок вертикального BOM-звіту;
 * - зберігає ієрархічний рівень;
 * - зберігає кількість елемента відносно Product;
 * - зберігає шлях проходження BOM.
 */

import { ElementType } from '../../../config/config';

export interface BOMVerticalReportRow {
  level: number;

  parentId: string;
  parentCode: string;

  elementId: string;
  code: string;
  name: string;
  elementType: ElementType;

  /** Кількість елемента безпосередньо у Parent */
  directQty: number;

  /** Кількість елемента відносно кореневого Product */
  totalQty: number;

  unit: string;

  /** Шлях від Product до поточного елемента */
  path: readonly string[];
}
