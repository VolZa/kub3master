/**
 * ==========================================================
 * ERP КУБ
 * Module: Manufacturing
 * File: manufacturing-buffer-creation-application.service.ts
 * Path: src/modules/manufacturing/services/manufacturing-buffer-creation-application.service.ts
 *
 * Layer: Application / Service
 *
 * Призначення:
 * Створення Manufacturing безпосередньо з рядка-буфера
 * Google Sheets.
 *
 * Сервіс координує:
 * - читання буфера;
 * - перетворення буфера у ManufacturingInput;
 * - створення та збереження Manufacturing.
 * ==========================================================
 */

import { Manufacturing } from '../../../domain/manufacturing/manufacturing.model';
import { GoogleSheetsManufacturingBufferReader } from '../../../infrastructure/sheets/manufacturing/GoogleSheetsManufacturingBufferReader';

import { ManufacturingInputBufferMapper } from '../mapping/manufacturingInputBufferMapper';
import { ManufacturingCreationApplicationService } from './manufacturing-creation-application.service';
import { IManufacturingBufferCreationApplicationService } from './manufacturing-buffer-creation-application.service.interface';

export class ManufacturingBufferCreationApplicationService implements IManufacturingBufferCreationApplicationService {
  constructor(
    private readonly bufferReader: GoogleSheetsManufacturingBufferReader,
    private readonly creationApplicationService: ManufacturingCreationApplicationService,
  ) {}

  public createFromBuffer(): Manufacturing {
    const row = this.bufferReader.read();

    const input = ManufacturingInputBufferMapper.mapRowToInput(row);

    return this.creationApplicationService.create(input);
  }
}
