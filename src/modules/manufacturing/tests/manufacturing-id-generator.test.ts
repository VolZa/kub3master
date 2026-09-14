/**
 * ==========================================================
 * ERP КУБ
 * Module: Manufacturing
 * File: manufacturing-id-generator.test.ts
 * Path: src/modules/manufacturing/tests/manufacturing-id-generator.test.ts
 *
 * Layer: Test
 *
 * Призначення:
 * Інтеграційний тест ManufacturingIdGenerator.
 *
 * Перевіряє генерацію наступного ID на основі реальних
 * Manufacturing-записів.
 * ==========================================================
 */

import { getManufacturingRepository } from '../../../app/factories/manufacturing.factory';
import { ManufacturingIdGenerator } from '../services/manufacturing-id.generator';

export function testManufacturingIdGenerator(): void {
  const repository = getManufacturingRepository();

  const items = repository.getAll();

  if (items.length === 0) {
    throw new Error('TEST FAILED: ManufacturingRepository не містить записів.');
  }

  const generator = new ManufacturingIdGenerator(repository);

  const generatedId = generator.generate();

  const match = generatedId.match(/^М(\d+)$/);

  if (!match) {
    throw new Error(`TEST FAILED: Згенеровано некоректний ID: ${generatedId}`);
  }

  const generatedNumber = Number(match[1]);

  const numbers = items
    .map((item) => {
      const idMatch = item.id.match(/^М(\d+)$/);
      return idMatch ? Number(idMatch[1]) : 0;
    })
    .filter((number) => number > 0);

  const maxNumber = Math.max(...numbers);
  const expectedNumber = maxNumber + 1;

  if (generatedNumber !== expectedNumber) {
    throw new Error(
      `TEST FAILED: Очікувався ID М${String(expectedNumber).padStart(8, '0')}, ` +
        `отримано ${generatedId}.`,
    );
  }

  Logger.log(`Максимальний існуючий номер: ${maxNumber}`);

  Logger.log(`Згенерований наступний ID: ${generatedId}`);

  Logger.log('MANUFACTURING ID GENERATOR TEST PASSED.');
}
