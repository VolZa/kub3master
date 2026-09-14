/**
 * ==========================================================
 * ERP КУБ
 * Module: Manufacturing
 * File: manufacturing-creation-formula-debug.test.ts
 * Path: src/modules/manufacturing/tests/manufacturing-creation-formula-debug.test.ts
 *
 * Layer: Test
 *
 * Призначення:
 * Діагностика представлення формули 10_Оснастка!A3.
 * ==========================================================
 */

import { sheetProvider } from '../../../app/factories/infrastructure.factory';
import { SheetKey } from '../../../infrastructure/sheets/SheetKey';

export function testManufacturingCreationFormulaDebug(): void {
  const toolingSheet = sheetProvider.get(SheetKey.TOOLING);

  const cell = toolingSheet.getRange('A3');

  Logger.log(`getFormula(): ${cell.getFormula()}`);
  Logger.log(`getFormulaR1C1(): ${cell.getFormulaR1C1()}`);
}
