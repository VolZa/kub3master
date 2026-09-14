/**
 * ==========================================================
 * ERP КУБ
 * Module: Manufacturing
 * File: manufacturing-id.generator.ts
 * Path: src/modules/manufacturing/services/manufacturing-id.generator.ts
 *
 * Layer: Application / Service
 *
 * Призначення:
 * Генерація наступного ID для Manufacturing.
 *
 * Формат:
 * М00000001
 * М00000002
 * ...
 *
 * Генерація не залежить від номера рядка Google Sheets.
 * ==========================================================
 */

import { IManufacturingRepository } from '../manufacturing.repository.interface';

export class ManufacturingIdGenerator {
  constructor(
    private readonly manufacturingRepository: IManufacturingRepository,
  ) {}

  public generate(): string {
    const items = this.manufacturingRepository.getAll();

    let maxNumber = 0;

    for (const item of items) {
      const number = this.extractNumber(item.id);

      if (number > maxNumber) {
        maxNumber = number;
      }
    }

    return `М${String(maxNumber + 1).padStart(8, '0')}`;
  }

  private extractNumber(id: string): number {
    const match = id.trim().match(/^М(\d+)$/);

    if (!match) {
      return 0;
    }

    const number = Number(match[1]);

    return Number.isFinite(number) ? number : 0;
  }
}
