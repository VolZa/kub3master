/**
 * ==========================================================
 * ERP КУБ
 * Module: Manufacturing
 * File: manufacturing-buffer-creation.factory.ts
 * Path: src\app\factories\manufacturing-buffer-creation.factory.ts
 *
 * Factory для створення Application Service,
 * який створює Manufacturing із рядка-буфера.
 * ==========================================================
 */

import { sheetProvider } from './infrastructure.factory';

import { getManufacturingCreationApplicationService } from './manufacturing-creation.factory';

import { ManufacturingBufferCreationApplicationService } from '../../modules/manufacturing/services/manufacturing-buffer-creation-application.service';

import { GoogleSheetsManufacturingBufferReader } from '../../infrastructure/sheets/manufacturing/GoogleSheetsManufacturingBufferReader';

let service: ManufacturingBufferCreationApplicationService | null = null;

export function getManufacturingBufferCreationApplicationService(): ManufacturingBufferCreationApplicationService {
  if (!service) {
    const creationApplicationService =
      getManufacturingCreationApplicationService();

    const bufferReader = new GoogleSheetsManufacturingBufferReader(
      sheetProvider,
    );

    service = new ManufacturingBufferCreationApplicationService(
      bufferReader,
      creationApplicationService,
    );
  }

  return service;
}

// import { sheetProvider } from './infrastructure.factory';

// import { getHouseRepository } from './house.factory';
// import { getPlacementRepository } from './placement.factory';
// import { getManufacturingRepository } from './manufacturing.factory';

// import { ManufacturingInputValidator } from '../../modules/manufacturing/validation/manufacturing-input.validator';
// import { ManufacturingIdGenerator } from '../../modules/manufacturing/services/manufacturing-id.generator';
// import { ManufacturingCreationService } from '../../modules/manufacturing/services/manufacturing-creation.service';
// import { ManufacturingCreationApplicationService } from '../../modules/manufacturing/services/manufacturing-creation-application.service';
// import { ManufacturingBufferCreationApplicationService } from '../../modules/manufacturing/services/manufacturing-buffer-creation-application.service';

// import { GoogleSheetsManufacturingBufferReader } from '../../infrastructure/sheets/manufacturing/GoogleSheetsManufacturingBufferReader';
// import { GoogleSheetsWriter } from '../../infrastructure/sheets/GoogleSheetsWriter';

// let service: ManufacturingBufferCreationApplicationService | null = null;

// export function getManufacturingBufferCreationApplicationService(): ManufacturingBufferCreationApplicationService {
//   if (!service) {
//     const manufacturingRepository = getManufacturingRepository();

//     const houseRepository = getHouseRepository();
//     const placementRepository = getPlacementRepository();

//     const validator = new ManufacturingInputValidator(
//       houseRepository,
//       placementRepository,
//     );

//     const idGenerator = new ManufacturingIdGenerator(manufacturingRepository);

//     const creationService = new ManufacturingCreationService(
//       validator,
//       idGenerator,
//     );

//     const writer = new GoogleSheetsWriter(sheetProvider);

//     const creationApplicationService =
//       new ManufacturingCreationApplicationService(
//         creationService,
//         manufacturingRepository,
//         writer,
//       );

//     const bufferReader = new GoogleSheetsManufacturingBufferReader(
//       sheetProvider,
//     );

//     service = new ManufacturingBufferCreationApplicationService(
//       bufferReader,
//       creationApplicationService,
//     );
//   }

//   return service;
// }
