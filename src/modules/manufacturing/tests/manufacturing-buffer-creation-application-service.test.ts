/**
 * ==========================================================
 * ERP КУБ
 * Module: Manufacturing
 * File: manufacturing-buffer-creation-application-service.test.ts
 * Path: src/modules/manufacturing/tests/manufacturing-buffer-creation-application-service.test.ts
 *
 * Layer: Test
 *
 * Призначення:
 * Одноразова інтеграційна перевірка створення Manufacturing
 * безпосередньо з рядка-буфера 01_Виготовлення.
 *
 * Перевіряє повний ланцюг:
 * Buffer → Input → Manufacturing → Google Sheets.
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
import { GoogleSheetsManufacturingBufferReader } from '../../../infrastructure/sheets/manufacturing/GoogleSheetsManufacturingBufferReader';

import { ManufacturingInputBufferMapper } from '../mapping/manufacturingInputBufferMapper';
import { ManufacturingCreationService } from '../services/manufacturing-creation.service';
import { ManufacturingCreationApplicationService } from '../services/manufacturing-creation-application.service';
import { ManufacturingIdGenerator } from '../services/manufacturing-id.generator';
// import { ManufacturingInputBufferCreationApplicationService } from '../services/manufacturing-buffer-creation-application.service';
import { ManufacturingBufferCreationApplicationService } from '../services/manufacturing-buffer-creation-application.service';
import { ManufacturingInputValidator } from '../validation/manufacturing-input.validator';

export function testManufacturingBufferCreationApplicationService(): void {
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

  const creationApplicationService =
    new ManufacturingCreationApplicationService(
      creationService,
      manufacturingRepository,
      writer,
    );

  const bufferReader = new GoogleSheetsManufacturingBufferReader(sheetProvider);

  const bufferCreationService =
    new ManufacturingBufferCreationApplicationService(
      bufferReader,
      creationApplicationService,
    );
  //   const bufferCreationService =
  //     new ManufacturingInputBufferCreationApplicationService(
  //       bufferReader,
  //       creationApplicationService,
  //     );

  const manufacturing = bufferCreationService.createFromBuffer();

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

  Logger.log(`✓ Manufacturing ${manufacturing.id} створений із рядка-буфера.`);

  Logger.log('✓ Новий Manufacturing записаний у рядок 3.');

  Logger.log('✓ Системні поля записані.');

  Logger.log('✓ Формула 10_Оснастка!A3 збережена.');

  Logger.log('✓ Рядок 2 залишився буфером.');

  Logger.log('MANUFACTURING BUFFER CREATION APPLICATION SERVICE TEST PASSED.');
}
