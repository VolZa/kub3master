/**
 * ==========================================================
 * ERP КУБ
 * Module: Manufacturing
 * File: manufacturing-input-validator.test.ts
 * Path: src/modules/manufacturing/tests/manufacturing-input-validator.test.ts
 *
 * Layer: Test
 *
 * Призначення:
 * Інтеграційні тести ManufacturingInputValidator.
 *
 * Перевіряє позитивні та негативні сценарії валідації
 * ManufacturingInput на реальних репозиторіях.
 * ==========================================================
 */

import { getHouseRepository } from '../../../app/factories/house.factory';
import { getPlacementRepository } from '../../../app/factories/placement.factory';

import { ManufacturingInputValidator } from '../../manufacturing/validation/manufacturing-input.validator';
import { ManufacturingInput } from '../../manufacturing/types/manufacturing-input';

export function testManufacturingInputValidator(): void {
  const houseRepository = getHouseRepository();
  const placementRepository = getPlacementRepository();

  const houses = houseRepository.findAll();

  const activeHouse = houses.find((house) => house.status === 'Active');

  if (!activeHouse) {
    throw new Error('TEST FAILED: Не знайдено жодного активного будинку.');
  }

  const validator = new ManufacturingInputValidator(
    houseRepository,
    placementRepository,
  );

  const baseInput: ManufacturingInput = {
    date: new Date(),
    shift: '1',
    houseCode: activeHouse.code,
    productCode: 'TEST-PRODUCT',
    quantity: 1,
    placementId: undefined,
    master: '',
    comment: '',
  };

  interface ValidationScenario {
    name: string;
    input: ManufacturingInput;
    expectedValid: boolean;
  }

  const scenarios: ValidationScenario[] = [
    {
      name: 'Коректний запис без Placement',
      input: {
        ...baseInput,
      },
      expectedValid: true,
    },

    {
      name: 'Відсутня дата',
      input: {
        ...baseInput,
        date: undefined,
      },
      expectedValid: false,
    },

    {
      name: 'Некоректна зміна',
      input: {
        ...baseInput,
        shift: '3',
      },
      expectedValid: false,
    },

    {
      name: 'Неіснуючий будинок',
      input: {
        ...baseInput,
        houseCode: 'H999',
      },
      expectedValid: false,
    },

    {
      name: 'Порожній код виробу',
      input: {
        ...baseInput,
        productCode: '',
      },
      expectedValid: false,
    },

    {
      name: 'Некоректна кількість',
      input: {
        ...baseInput,
        quantity: 0,
      },
      expectedValid: false,
    },

    {
      name: 'Дробова кількість',
      input: {
        ...baseInput,
        quantity: 1.5,
      },
      expectedValid: false,
    },

    {
      name: 'Неіснуюча позиція',
      input: {
        ...baseInput,
        placementId: 999999,
      },
      expectedValid: false,
    },
  ];

  for (const scenario of scenarios) {
    const result = validator.validate(scenario.input);

    if (result.valid !== scenario.expectedValid) {
      throw new Error(
        `TEST FAILED: ${scenario.name}. ` +
          `Очікувалось valid=${scenario.expectedValid}, ` +
          `отримано valid=${result.valid}. ` +
          `Помилки: ${result.errors.join('; ')}`,
      );
    }

    Logger.log(`✓ ${scenario.name}`);
  }

  Logger.log('MANUFACTURING INPUT VALIDATOR NEGATIVE TESTS PASSED.');

  const placements = placementRepository.getAll();

  if (placements.length === 0) {
    throw new Error(
      'TEST FAILED: У репозиторії Placement немає жодної позиції.',
    );
  }

  const placement = placements[0];

  const placementScenarios: ValidationScenario[] = [
    {
      name: 'Коректний Placement',
      input: {
        ...baseInput,
        houseCode: placement.houseCode,
        productCode: placement.productCode,
        quantity: 1,
        placementId: placement.id,
      },
      expectedValid: true,
    },

    {
      name: 'Placement іншого будинку',
      input: {
        ...baseInput,
        houseCode: 'H002',
        productCode: placement.productCode,
        quantity: 1,
        placementId: placement.id,
      },
      expectedValid: false,
    },

    {
      name: 'Placement іншого виробу',
      input: {
        ...baseInput,
        houseCode: placement.houseCode,
        productCode: 'OTHER-PRODUCT',
        quantity: 1,
        placementId: placement.id,
      },
      expectedValid: false,
    },

    {
      name: 'Placement + кількість більше 1',
      input: {
        ...baseInput,
        houseCode: placement.houseCode,
        productCode: placement.productCode,
        quantity: 2,
        placementId: placement.id,
      },
      expectedValid: false,
    },
  ];

  for (const scenario of placementScenarios) {
    const result = validator.validate(scenario.input);

    if (result.valid !== scenario.expectedValid) {
      throw new Error(
        `TEST FAILED: ${scenario.name}. ` +
          `Очікувалось valid=${scenario.expectedValid}, ` +
          `отримано valid=${result.valid}. ` +
          `Помилки: ${result.errors.join('; ')}`,
      );
    }

    Logger.log(`✓ ${scenario.name}`);
  }

  Logger.log('MANUFACTURING INPUT VALIDATOR PLACEMENT TESTS PASSED.');
}
// /**
//  * ==========================================================
//  * ERP КУБ
//  * Module: Manufacturing
//  * File: manufacturing-input-validator.test.ts
//  * Path: src/modules/manufacturing/tests/manufacturing-input-validator.test.ts
//  *
//  * Layer: Test
//  *
//  * Призначення:
//  * Інтеграційний тест ManufacturingInputValidator.
//  *
//  * Перевіряє позитивний сценарій:
//  * коректний ManufacturingInput без Placement
//  * проходить валідацію.
//  * ==========================================================
//  */

// import { getHouseRepository } from '../../../app/factories/house.factory';
// import { getPlacementRepository } from '../../../app/factories/placement.factory';

// import { ManufacturingInputValidator } from '../../manufacturing/validation/manufacturing-input.validator';
// import { ManufacturingInput } from '../../manufacturing/types/manufacturing-input';

// export function testManufacturingInputValidatorValid(): void {
//   const houseRepository = getHouseRepository();
//   const placementRepository = getPlacementRepository();

//   const houses = houseRepository.findAll();

//   const activeHouse = houses.find((house) => house.status === 'Active');

//   if (!activeHouse) {
//     throw new Error('TEST FAILED: Не знайдено жодного активного будинку.');
//   }

//   const input: ManufacturingInput = {
//     date: new Date(),
//     shift: '1',
//     houseCode: activeHouse.code,
//     productCode: 'TEST-PRODUCT',
//     quantity: 1,
//     placementId: undefined,
//     master: '',
//     comment: '',
//   };

//   const validator = new ManufacturingInputValidator(
//     houseRepository,
//     placementRepository,
//   );

//   const result = validator.validate(input);

//   if (!result.valid) {
//     throw new Error(
//       `TEST FAILED: Коректний ManufacturingInput не пройшов валідацію: ${result.errors.join('; ')}`,
//     );
//   }

//   if (result.errors.length !== 0) {
//     throw new Error(
//       `TEST FAILED: Для коректного ManufacturingInput отримано помилки: ${result.errors.join('; ')}`,
//     );
//   }

//   Logger.log('MANUFACTURING INPUT VALIDATOR VALID TEST PASSED.');
// }
