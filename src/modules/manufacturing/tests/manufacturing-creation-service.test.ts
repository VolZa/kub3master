/**
 * ==========================================================
 * ERP КУБ
 * Module: Manufacturing
 * File: manufacturing-creation-service.test.ts
 * Path: src/modules/manufacturing/tests/manufacturing-creation-service.test.ts
 *
 * Layer: Test
 *
 * Призначення:
 * Перевірка ManufacturingCreationService.
 *
 * Перевіряє:
 * - створення Manufacturing з коректного ManufacturingInput;
 * - генерацію ID;
 * - системний статус ACTIVE;
 * - створення CreatedAt та UpdatedAt;
 * - відхилення некоректних даних.
 * ==========================================================
 */

import { getHouseRepository } from '../../../app/factories/house.factory';
import { getManufacturingRepository } from '../../../app/factories/manufacturing.factory';
import { getPlacementRepository } from '../../../app/factories/placement.factory';

import { ManufacturingCreationService } from '../../manufacturing/services/manufacturing-creation.service';
import { ManufacturingIdGenerator } from '../../manufacturing/services/manufacturing-id.generator';
import { ManufacturingInput } from '../../manufacturing/types/manufacturing-input';
import { ManufacturingInputValidator } from '../../manufacturing/validation/manufacturing-input.validator';

export function testManufacturingCreationService(): void {
  const houseRepository = getHouseRepository();
  const placementRepository = getPlacementRepository();
  const manufacturingRepository = getManufacturingRepository();

  const validator = new ManufacturingInputValidator(
    houseRepository,
    placementRepository,
  );

  const idGenerator = new ManufacturingIdGenerator(manufacturingRepository);

  const service = new ManufacturingCreationService(validator, idGenerator);

  const input: ManufacturingInput = {
    date: new Date(),
    shift: '1',
    houseCode: 'H001',
    productCode: 'P-2.2',
    quantity: 1,
    placementId: undefined,
    master: 'Тест',
    comment: 'Тест створення Manufacturing',
  };

  const manufacturing = service.create(input);

  if (!manufacturing.id) {
    throw new Error('TEST FAILED: ID Manufacturing не сформовано.');
  }

  if (!/^М\d{8}$/.test(manufacturing.id)) {
    throw new Error(`TEST FAILED: Некоректний формат ID: ${manufacturing.id}`);
  }

  if (manufacturing.status !== 'ACTIVE') {
    throw new Error(
      'TEST FAILED: Статус нового Manufacturing повинен бути ACTIVE.',
    );
  }

  if (
    !(manufacturing.createdAt instanceof Date) ||
    Number.isNaN(manufacturing.createdAt.getTime())
  ) {
    throw new Error('TEST FAILED: Некоректне CreatedAt.');
  }

  if (
    !(manufacturing.updatedAt instanceof Date) ||
    Number.isNaN(manufacturing.updatedAt.getTime())
  ) {
    throw new Error('TEST FAILED: Некоректне UpdatedAt.');
  }

  if (manufacturing.createdAt.getTime() !== manufacturing.updatedAt.getTime()) {
    throw new Error(
      'TEST FAILED: CreatedAt та UpdatedAt повинні бути однаковими при створенні.',
    );
  }

  if (manufacturing.houseCode !== input.houseCode) {
    throw new Error('TEST FAILED: Будинок перенесено неправильно.');
  }

  if (manufacturing.productCode !== input.productCode) {
    throw new Error('TEST FAILED: Код виробу перенесено неправильно.');
  }

  if (manufacturing.quantity !== input.quantity) {
    throw new Error('TEST FAILED: Кількість перенесено неправильно.');
  }

  if (manufacturing.placementId !== input.placementId) {
    throw new Error('TEST FAILED: PlacementId перенесено неправильно.');
  }

  if (manufacturing.master !== input.master) {
    throw new Error('TEST FAILED: Майстра перенесено неправильно.');
  }

  if (manufacturing.comment !== input.comment) {
    throw new Error('TEST FAILED: Примітку перенесено неправильно.');
  }

  let rejected = false;

  try {
    service.create({
      ...input,
      quantity: 0,
    });
  } catch {
    rejected = true;
  }

  if (!rejected) {
    throw new Error('TEST FAILED: Некоректна кількість не була відхилена.');
  }

  Logger.log(`✓ Створено Manufacturing ${manufacturing.id}.`);

  Logger.log('✓ Системні поля ID / ACTIVE / CreatedAt / UpdatedAt сформовані.');

  Logger.log('✓ Дані ManufacturingInput перенесені коректно.');

  Logger.log('✓ Некоректний input відхилений.');

  Logger.log('MANUFACTURING CREATION SERVICE TEST PASSED.');
}
