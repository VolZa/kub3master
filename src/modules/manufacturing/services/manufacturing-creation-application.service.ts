/**
 * ==========================================================
 * ERP КУБ
 * Module: Manufacturing
 * File: manufacturing-creation-application.service.ts
 * Path: src/modules/manufacturing/services/manufacturing-creation-application.service.ts
 *
 * Layer: Application / Service
 *
 * Призначення:
 * Координація процесу створення Manufacturing.
 *
 * Сервіс:
 * - формує Manufacturing через ManufacturingCreationService;
 * - готує фізичну структуру таблиць;
 * - передає Manufacturing до Repository;
 * - зберігає Manufacturing;
 * - запускає оперативну синхронізацію Manufacturing → Placement.
 *
 * Бізнес-логіка створення знаходиться
 * у ManufacturingCreationService.
 * ==========================================================
 */

import { Manufacturing } from '../../../domain/manufacturing/manufacturing.model';

import { IManufacturingRepository } from '../manufacturing.repository.interface';
import { ManufacturingInput } from '../types/manufacturing-input';

import { ManufacturingCreationService } from './manufacturing-creation.service';
import { IManufacturingCreationApplicationService } from './manufacturing-creation-application.service.interface';

import { GoogleSheetsWriter } from '../../../infrastructure/sheets/GoogleSheetsWriter';

import { ManufacturingSynchronizationApplicationService } from '../../manufacturingSync/services/manufacturing-synchronization-application.service';

export class ManufacturingCreationApplicationService implements IManufacturingCreationApplicationService {
  constructor(
    private readonly creationService: ManufacturingCreationService,
    private readonly manufacturingRepository: IManufacturingRepository,
    private readonly writer: GoogleSheetsWriter,
    private readonly synchronizationService: ManufacturingSynchronizationApplicationService,
  ) {}

  public create(input: Readonly<ManufacturingInput>): Manufacturing {
    const manufacturing = this.creationService.create(input);

    this.writer.prepareManufacturingCreation();

    this.manufacturingRepository.create(manufacturing);
    this.manufacturingRepository.save();

    // Після успішного запису Manufacturing
    // виконуємо оперативну синхронізацію з Placement.
    this.synchronizationService.synchronize(manufacturing);

    return manufacturing;
  }
}
