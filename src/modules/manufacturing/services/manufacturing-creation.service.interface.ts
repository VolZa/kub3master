/**
 * ==========================================================
 * ERP КУБ
 * Module: Manufacturing
 * File: manufacturing-creation.service.interface.ts
 * Path: src/modules/manufacturing/services/manufacturing-creation.service.interface.ts
 *
 * Layer: Application / Service
 *
 * Призначення:
 * Контракт сервісу створення Manufacturing.
 *
 * Сервіс отримує дані введення та формує нову доменну
 * сутність Manufacturing.
 * ==========================================================
 */

import { Manufacturing } from '../../../domain/manufacturing/manufacturing.model';
import { ManufacturingInput } from '../types/manufacturing-input';

export interface IManufacturingCreationService {
  create(input: Readonly<ManufacturingInput>): Manufacturing;
}
