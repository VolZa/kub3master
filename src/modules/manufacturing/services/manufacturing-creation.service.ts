/**
 * ==========================================================
 * ERP КУБ
 * Module: Manufacturing
 * File: manufacturing-creation.service.ts
 * Path: src/modules/manufacturing/services/manufacturing-creation.service.ts
 *
 * Layer: Application / Service
 *
 * Призначення:
 * Створення доменної сутності Manufacturing
 * з даних ManufacturingInput.
 *
 * Сервіс:
 * - перевіряє вхідні дані;
 * - генерує новий ID;
 * - формує системні поля;
 * - не виконує запис у Google Sheets.
 * ==========================================================
 */

import { Manufacturing } from '../../../domain/manufacturing/manufacturing.model';
import { ManufacturingInput } from '../types/manufacturing-input';
import { ManufacturingInputValidator } from '../validation/manufacturing-input.validator';
import { ManufacturingIdGenerator } from './manufacturing-id.generator';
import { IManufacturingCreationService } from './manufacturing-creation.service.interface';

export class ManufacturingCreationService implements IManufacturingCreationService {
  constructor(
    private readonly validator: ManufacturingInputValidator,
    private readonly idGenerator: ManufacturingIdGenerator,
  ) {}

  public create(input: Readonly<ManufacturingInput>): Manufacturing {
    const validation = this.validator.validate(input);

    if (!validation.valid) {
      throw new Error(
        `Некоректні дані Manufacturing:\n${validation.errors.join('\n')}`,
      );
    }

    const now = new Date();

    return {
      id: this.idGenerator.generate(),
      date: input.date as Date,
      shift: input.shift,
      houseCode: input.houseCode.trim(),
      productCode: input.productCode.trim(),
      quantity: input.quantity as number,
      placementId: input.placementId,
      master: input.master.trim(),
      comment: input.comment.trim(),
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    };
  }
}
