/**
 * ==========================================================
 * ERP КУБ
 * Module: Manufacturing
 * File: manufacturing-buffer-creation-application.service.interface.ts
 * Path: src/modules/manufacturing/services/manufacturing-buffer-creation-application.service.interface.ts
 *
 * Layer: Application / Service
 *
 * Призначення:
 * Контракт прикладного сервісу створення Manufacturing
 * безпосередньо з рядка-буфера Google Sheets.
 * ==========================================================
 */

import { Manufacturing } from '../../../domain/manufacturing/manufacturing.model';

export interface IManufacturingBufferCreationApplicationService {
  createFromBuffer(): Manufacturing;
}
