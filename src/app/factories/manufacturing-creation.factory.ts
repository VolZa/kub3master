/**
 * ==========================================================
 * ERP КУБ
 * Module: Manufacturing
 * File: manufacturing-creation.factory.ts
 * Path: src/app/factories/manufacturing-creation.factory.ts
 *
 * Layer: Application / Factory
 *
 * Призначення:
 * Єдина точка складання сервісу створення Manufacturing.
 *
 * Сервіс створення додатково отримує
 * ManufacturingSynchronizationApplicationService
 * для оперативної синхронізації Manufacturing → Placement.
 * ==========================================================
 */

import { sheetProvider } from './infrastructure.factory';

import { getHouseRepository } from './house.factory';
import { getPlacementRepository } from './placement.factory';
import { getManufacturingRepository } from './manufacturing.factory';
import { getManufacturingSyncStateRepository } from './manufacturing-sync-state.factory';

import { ManufacturingInputValidator } from '../../modules/manufacturing/validation/manufacturing-input.validator';
import { ManufacturingIdGenerator } from '../../modules/manufacturing/services/manufacturing-id.generator';
import { ManufacturingCreationService } from '../../modules/manufacturing/services/manufacturing-creation.service';
import { ManufacturingCreationApplicationService } from '../../modules/manufacturing/services/manufacturing-creation-application.service';

import { ManufacturingSynchronizationApplicationService } from '../../modules/manufacturingSync/services/manufacturing-synchronization-application.service';

import { GoogleSheetsWriter } from '../../infrastructure/sheets/GoogleSheetsWriter';

let service: ManufacturingCreationApplicationService | null = null;

export function getManufacturingCreationApplicationService(): ManufacturingCreationApplicationService {
  if (!service) {
    const manufacturingRepository = getManufacturingRepository();

    const houseRepository = getHouseRepository();
    const placementRepository = getPlacementRepository();
    const syncStateRepository = getManufacturingSyncStateRepository();

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

    const synchronizationService =
      new ManufacturingSynchronizationApplicationService(
        syncStateRepository,
        placementRepository,
      );

    service = new ManufacturingCreationApplicationService(
      creationService,
      manufacturingRepository,
      writer,
      synchronizationService,
    );
  }

  return service;
}
