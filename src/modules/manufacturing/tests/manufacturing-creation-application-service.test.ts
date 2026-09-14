/**
 * ==========================================================
 * ERP КУБ
 * Module: Manufacturing
 * File: manufacturing-creation-application-service.test.ts
 * Path: src/modules/manufacturing/tests/manufacturing-creation-application-service.test.ts
 *
 * Layer: Test
 *
 * Призначення:
 * Інтеграційна перевірка повного процесу створення
 * Manufacturing через Application Service.
 *
 * Перевіряє:
 * - підготовку нового буфера 01_Виготовлення;
 * - створення Manufacturing;
 * - запис нового Manufacturing у рядок 3;
 * - системні поля;
 * - збереження формули 10_Оснастка!A3.
 *
 * УВАГА:
 * Тест реально змінює таблиці.
 * Запускати один раз для приймання механізму.
 * ==========================================================
 */

import { getHouseRepository } from '../../../app/factories/house.factory';
import { getManufacturingRepository } from '../../../app/factories/manufacturing.factory';
import { getPlacementRepository } from '../../../app/factories/placement.factory';
import { sheetProvider } from '../../../app/factories/infrastructure.factory';

import { SheetKey } from '../../../infrastructure/sheets/SheetKey';
import { GoogleSheetsWriter } from '../../../infrastructure/sheets/GoogleSheetsWriter';

import { ManufacturingCreationApplicationService } from '../services/manufacturing-creation-application.service';
import { ManufacturingCreationService } from '../services/manufacturing-creation.service';
import { ManufacturingIdGenerator } from '../services/manufacturing-id.generator';
import { ManufacturingInput } from '../types/manufacturing-input';
import { ManufacturingInputValidator } from '../validation/manufacturing-input.validator';

export function testManufacturingCreationApplicationService(): void {
  const houseRepository = getHouseRepository();
  const placementRepository = getPlacementRepository();
  const manufacturingRepository = getManufacturingRepository();

  const validator = new ManufacturingInputValidator(
    houseRepository,
    placementRepository,
  );

  const idGenerator = new ManufacturingIdGenerator(manufacturingRepository);

  const creationService = new ManufacturingCreationService(
    validator,
    idGenerator,
  );

  const writer = new GoogleSheetsWriter(sheetProvider);

  const applicationService = new ManufacturingCreationApplicationService(
    creationService,
    manufacturingRepository,
    writer,
  );

  const input: ManufacturingInput = {
    date: new Date(),
    shift: '1',
    houseCode: 'H001',
    productCode: 'P-2.2',
    quantity: 1,
    placementId: undefined,
    master: 'Тест',
    comment: 'Інтеграційний тест створення Manufacturing',
  };

  const manufacturing = applicationService.create(input);

  const manufacturingSheet = sheetProvider.get(SheetKey.MANUFACTURING);

  const toolingSheet = sheetProvider.get(SheetKey.TOOLING);

  const row3 = manufacturingSheet.getRange(3, 1, 1, 12).getValues()[0];

  if (row3[0] !== manufacturing.id) {
    throw new Error(
      `TEST FAILED: У рядку 3 очікувався ID ${manufacturing.id}, отримано ${row3[0]}.`,
    );
  }

  if (row3[9] !== 'ACTIVE') {
    throw new Error(
      `TEST FAILED: Очікувався статус ACTIVE, отримано ${row3[9]}.`,
    );
  }

  if (!(row3[10] instanceof Date)) {
    throw new Error('TEST FAILED: Поле Створено не записано як Date.');
  }

  if (!(row3[11] instanceof Date)) {
    throw new Error('TEST FAILED: Поле Змінено не записано як Date.');
  }

  if (row3[4] !== input.productCode) {
    throw new Error('TEST FAILED: Код виробу записано неправильно.');
  }

  if (row3[5] !== input.quantity) {
    throw new Error('TEST FAILED: Кількість записано неправильно.');
  }

  if (row3[6] !== '') {
    throw new Error('TEST FAILED: Placement повинен бути порожнім.');
  }

  const formula = toolingSheet.getRange('A3').getFormula();

  const expectedFormula = "=ARRAYFORMULA('01_Виготовлення'!B3:E)";

  if (formula !== expectedFormula) {
    throw new Error(
      `TEST FAILED: Некоректна формула 10_Оснастка!A3. Отримано: ${formula}`,
    );
  }

  const bufferRow = manufacturingSheet.getRange(2, 1, 1, 12).getValues()[0];

  if (bufferRow[0] !== '') {
    throw new Error('TEST FAILED: Рядок 2 не залишився буфером.');
  }

  Logger.log(`✓ Створено Manufacturing ${manufacturing.id}.`);

  Logger.log('✓ Manufacturing записаний у рядок 3.');

  Logger.log('✓ Системні поля ID / ACTIVE / Створено / Змінено записані.');

  Logger.log('✓ 10_Оснастка!A3 містить правильну формулу.');

  Logger.log('✓ Рядок 2 залишився буфером.');

  Logger.log('MANUFACTURING CREATION APPLICATION SERVICE TEST PASSED.');
}
