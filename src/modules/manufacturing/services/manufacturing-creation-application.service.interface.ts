/**
 * ==========================================================
 * ERP КУБ
 * Module: Manufacturing
 * File: manufacturing-creation-application.service.interface.ts
 * Path: src/modules/manufacturing/services/manufacturing-creation-application.service.interface.ts
 *
 * Layer: Application / Service
 *
 * Призначення:
 * Контракт прикладного сервісу створення Manufacturing.
 *
 * Координує створення Manufacturing та його збереження.
 * ==========================================================
 */

import { Manufacturing } from '../../../domain/manufacturing/manufacturing.model';
import { ManufacturingInput } from '../types/manufacturing-input';

export interface IManufacturingCreationApplicationService {
  create(input: Readonly<ManufacturingInput>): Manufacturing;
}
