/**
 * ==========================================================
 * ERP КУБ
 * Module: Manufacturing
 * File: manufacturing-creation.factory.ts
 * Path: src\app\factories\manufacturing-creation.factory.ts
 *
 * Factory для ManufacturingCreationApplicationService.
 * Єдина точка складання сервісу створення Manufacturing.
 * ==========================================================
 */

import { sheetProvider } from './infrastructure.factory';

import { getHouseRepository } from './house.factory';
import { getPlacementRepository } from './placement.factory';
import { getManufacturingRepository } from './manufacturing.factory';

import { ManufacturingInputValidator } from '../../modules/manufacturing/validation/manufacturing-input.validator';
import { ManufacturingIdGenerator } from '../../modules/manufacturing/services/manufacturing-id.generator';
import { ManufacturingCreationService } from '../../modules/manufacturing/services/manufacturing-creation.service';
import { ManufacturingCreationApplicationService } from '../../modules/manufacturing/services/manufacturing-creation-application.service';

import { GoogleSheetsWriter } from '../../infrastructure/sheets/GoogleSheetsWriter';

let service: ManufacturingCreationApplicationService | null = null;

export function getManufacturingCreationApplicationService(): ManufacturingCreationApplicationService {
  if (!service) {
    const manufacturingRepository = getManufacturingRepository();

    const houseRepository = getHouseRepository();
    const placementRepository = getPlacementRepository();

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

    service = new ManufacturingCreationApplicationService(
      creationService,
      manufacturingRepository,
      writer,
    );
  }

  return service;
}
