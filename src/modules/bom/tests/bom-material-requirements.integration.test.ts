/**
 * ==========================================================
 * ERP КУБ
 * Module: BOM
 * Layer: Integration Test
 * File: bom-material-requirements.integration.test.ts
 * Path: src\modules\bom\tests\
 *
 * Перевірка матеріальної потреби виробу П-1.1
 * через реальні Repository та BOMMaterialsService.
 *
 * Контрольний результат взято зі старої
 * "ВідомостіВитрат".
 * ==========================================================
 */

import { getElementRepository } from '../../../app/factories/element.factory';
import { getBOMRepository } from '../../../app/factories/bom.factory';
import { getMaterialRepository } from '../../../app/factories/material.factory';

import { BOMExplorerService } from '../services/bom-explorer.service';
import { BOMMaterialsService } from '../services/bom-materials.service';

export function bomMaterialRequirementsIntegrationTest(): void {
  const PRODUCT_ID = '2024';
  const PRODUCT_CODE = 'П-1.1';

  const expected: Record<string, number> = {
    'R_4_BP-1': 6.212,
    R_12_А240С: 3.374,
    R_6_А500С: 7.957,
    R_8_А500С: 0,
    R_10_А500С: 0,
    R_12_А500С: 95.026,
    R_14_А500С: 16.844,
    ANGLE_100_63_8: 17.372,
  };

  const elementRepository = getElementRepository();
  const bomRepository = getBOMRepository();
  const materialRepository = getMaterialRepository();

  const bomExplorerService = new BOMExplorerService(
    elementRepository,
    bomRepository,
  );

  const bomMaterialsService = new BOMMaterialsService(
    bomExplorerService,
    materialRepository,
  );

  const requirements = bomMaterialsService.getMaterialRequirements(PRODUCT_ID);

  Logger.log(`=== BOM MATERIAL REQUIREMENTS: ${PRODUCT_CODE} ===`);
  Logger.log(`ProductID: ${PRODUCT_ID}`);

  const actual: Record<string, number> = {};

  requirements.forEach((requirement) => {
    const material = materialRepository.findById(requirement.materialId);

    if (!material) {
      throw new Error(`Material not found: ${requirement.materialId}`);
    }

    actual[material.code] = requirement.qty;

    Logger.log(
      `${material.code.padEnd(20)} ` +
        `${requirement.qty.toFixed(3).padStart(10)} ` +
        `${requirement.unit}`,
    );
  });

  Logger.log('');
  Logger.log('=== COMPARISON WITH "ВідомістьВитрат" ===');

  let errors = 0;

  Object.entries(expected).forEach(([code, expectedQty]) => {
    const actualQty = actual[code] ?? 0;

    const difference = Number((actualQty - expectedQty).toFixed(3));

    const status = difference === 0 ? 'OK' : 'ERROR';

    Logger.log(
      `${code.padEnd(20)} ` +
        `expected=${expectedQty.toFixed(3).padStart(8)} ` +
        `actual=${actualQty.toFixed(3).padStart(8)} ` +
        `diff=${difference.toFixed(3).padStart(8)} ` +
        `${status}`,
    );

    if (difference !== 0) {
      errors++;
    }
  });

  Object.keys(actual)
    .filter((code) => !(code in expected))
    .forEach((code) => {
      Logger.log(`UNEXPECTED MATERIAL: ${code} = ${actual[code].toFixed(3)}`);

      errors++;
    });

  if (errors > 0) {
    throw new Error(
      `BOM material requirements check failed: ${errors} error(s).`,
    );
  }

  Logger.log('');
  Logger.log('RESULT: OK');
}
