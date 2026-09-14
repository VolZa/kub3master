/**
 * ==========================================================
 * ERP КУБ
 * Module: Manufacturing
 * File: manufacturing-input.validator.ts
 * Path: src/modules/manufacturing/validation/manufacturing-input.validator.ts
 *
 * Layer: Application / Validation
 *
 * Призначення:
 * Перевірка даних ManufacturingInput перед створенням
 * Manufacturing.
 *
 * Валідатор не змінює дані та не виконує запис у Google Sheets.
 * ==========================================================
 */

import { IHouseRepository } from '../../../domain/houses/house.repository';
import { IPlacementRepository } from '../../placement/placement.repository.interface';

import { ManufacturingInput } from '../types/manufacturing-input';
import { ManufacturingInputValidationResult } from '../types/manufacturing-input-validation-result';

export class ManufacturingInputValidator {
  constructor(
    private readonly houseRepository: IHouseRepository,
    private readonly placementRepository: IPlacementRepository,
  ) {}

  public validate(
    input: Readonly<ManufacturingInput>,
  ): ManufacturingInputValidationResult {
    const errors: string[] = [];

    this.validateDate(input, errors);
    this.validateShift(input, errors);
    this.validateHouse(input, errors);
    this.validateProductCode(input, errors);
    this.validateQuantity(input, errors);
    this.validatePlacement(input, errors);

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  private validateDate(
    input: Readonly<ManufacturingInput>,
    errors: string[],
  ): void {
    if (!(input.date instanceof Date) || Number.isNaN(input.date.getTime())) {
      errors.push('Не вказана або некоректна дата.');
    }
  }

  private validateShift(
    input: Readonly<ManufacturingInput>,
    errors: string[],
  ): void {
    if (input.shift !== '1' && input.shift !== '2') {
      errors.push('Зміна повинна бути 1 або 2.');
    }
  }

  private validateHouse(
    input: Readonly<ManufacturingInput>,
    errors: string[],
  ): void {
    const houseCode = input.houseCode.trim();

    // Порожній будинок = виробництво поза проектом.
    if (!houseCode) {
      return;
    }

    const house = this.houseRepository.findByCode(houseCode);

    if (!house) {
      errors.push(`Будинок "${houseCode}" не знайдено.`);
      return;
    }

    if (house.status !== 'Active') {
      errors.push(`Будинок "${houseCode}" не є активним.`);
    }
  }

  private validateProductCode(
    input: Readonly<ManufacturingInput>,
    errors: string[],
  ): void {
    if (!input.productCode.trim()) {
      errors.push('Не вказано код виробу.');
    }
  }

  private validateQuantity(
    input: Readonly<ManufacturingInput>,
    errors: string[],
  ): void {
    if (
      input.quantity === undefined ||
      !Number.isFinite(input.quantity) ||
      !Number.isInteger(input.quantity) ||
      input.quantity <= 0
    ) {
      errors.push('Кількість повинна бути додатним цілим числом.');
    }
  }

  private validatePlacement(
    input: Readonly<ManufacturingInput>,
    errors: string[],
  ): void {
    // Позиція необов'язкова.
    if (input.placementId === undefined) {
      return;
    }

    const placement = this.placementRepository.findById(input.placementId);

    if (!placement) {
      errors.push(`Позицію ${input.placementId} не знайдено.`);
      return;
    }

    if (placement.houseCode !== input.houseCode.trim()) {
      errors.push(`Позиція ${input.placementId} належить іншому будинку.`);
    }

    if (placement.productCode !== input.productCode.trim()) {
      errors.push(`Позиція ${input.placementId} має інший код виробу.`);
    }

    if (input.quantity !== 1) {
      errors.push('При вибраній позиції кількість повинна дорівнювати 1.');
    }
  }
}
