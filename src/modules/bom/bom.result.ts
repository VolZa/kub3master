/**
 * src/modules/bom/bom.result.ts
 *
 * Модуль: BOM
 * Layer: Application
 *
 * Відповідальність:
 * - опис результату побудови BOM;
 * - передача помилок, попереджень і повідомлення оператору
 *   до викликаючого коду.
 */

import { BOMWarning } from './services/bom-completeness-checker';
import { BOMOperatorMessage } from './services/bom-warning-formatter';
import { TableRowInput } from './model/table-row-input.model';

export interface BuildBOMResult {
  added: number;
  errors: TableRowInput[];
  errorCount: number;

  warnings: BOMWarning[];
  warningCount: number;

  operatorMessage: BOMOperatorMessage | null;
}
