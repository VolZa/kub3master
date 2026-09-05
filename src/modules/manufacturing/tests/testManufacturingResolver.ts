import { getHouseRepository } from '../../../app/factories/house.factory';
import { getProjectDocumentRepository } from '../../../app/factories/project-document.factory';
import { getElementRepository } from '../../../app/factories/element.factory';

import { ManufacturingResolver } from '../services/manufacturingResolver';
import { ManufacturingInput } from '../types/manufacturingInput';

export function testManufacturingResolver(): void {
  const houseRepository = getHouseRepository();
  const projectDocumentRepository = getProjectDocumentRepository();
  const elementRepository = getElementRepository();

  const resolver = new ManufacturingResolver(
    houseRepository,
    projectDocumentRepository,
    elementRepository,
  );

  // -------------------------------------------------------
  // 1. Відомий будинок + відомий виріб
  // -------------------------------------------------------

  const validInput: ManufacturingInput = {
    date: new Date('2026-06-30'),
    shift: '',
    productCode: 'П-1',
    master: '',
    comment: 'площ',
    houseCode: 'H001',
  };

  const validResult = resolver.resolve(validInput);

  Logger.log('========== TEST 1 ==========');

  if (validResult.success) {
    Logger.log('✅ Resolution успішний');
    Logger.log(`HouseID: ${validResult.value.house.id}`);
    Logger.log(`HouseCode: ${validResult.value.house.code}`);
    Logger.log(`ProjectID: ${validResult.value.projectId}`);
    Logger.log(`ProjectDocumentID: ${validResult.value.projectDocumentId}`);
    Logger.log(`ProductID: ${validResult.value.productId}`);
    Logger.log(`ProductCode: ${validResult.value.input.productCode}`);
  } else {
    Logger.log(`❌ Resolution неочікувано завершився: ${validResult.reason}`);
  }

  // -------------------------------------------------------
  // 2. Невідомий будинок
  // -------------------------------------------------------

  const unknownHouseInput: ManufacturingInput = {
    ...validInput,
    houseCode: 'UNKNOWN',
  };

  const unknownHouseResult = resolver.resolve(unknownHouseInput);

  Logger.log('========== TEST 2 ==========');

  if (
    !unknownHouseResult.success &&
    unknownHouseResult.reason === 'HOUSE_NOT_FOUND'
  ) {
    Logger.log('✅ Невідомий будинок правильно визначено');
  } else {
    Logger.log(
      `❌ Неочікуваний результат: ${
        unknownHouseResult.success ? 'success' : unknownHouseResult.reason
      }`,
    );
  }

  // -------------------------------------------------------
  // 3. Відомий будинок + невідомий виріб
  // -------------------------------------------------------

  const unknownProductInput: ManufacturingInput = {
    ...validInput,
    productCode: 'НЕІСНУЄ',
  };

  const unknownProductResult = resolver.resolve(unknownProductInput);

  Logger.log('========== TEST 3 ==========');

  if (
    !unknownProductResult.success &&
    unknownProductResult.reason === 'PRODUCT_NOT_FOUND'
  ) {
    Logger.log('✅ Невідомий виріб правильно визначено');
  } else {
    Logger.log(
      `❌ Неочікуваний результат: ${
        unknownProductResult.success ? 'success' : unknownProductResult.reason
      }`,
    );
  }
}
