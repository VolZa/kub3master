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
 * - зберігає зміни.
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

export class ManufacturingCreationApplicationService implements IManufacturingCreationApplicationService {
  constructor(
    private readonly creationService: ManufacturingCreationService,
    private readonly manufacturingRepository: IManufacturingRepository,
    private readonly writer: GoogleSheetsWriter,
  ) {}

  public create(input: Readonly<ManufacturingInput>): Manufacturing {
    const manufacturing = this.creationService.create(input);

    this.writer.prepareManufacturingCreation();

    this.manufacturingRepository.create(manufacturing);
    this.manufacturingRepository.save();

    return manufacturing;
  }
}
