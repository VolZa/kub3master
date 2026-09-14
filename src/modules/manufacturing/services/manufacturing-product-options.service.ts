/**
 * ==========================================================
 * ERP КУБ
 * Module: Manufacturing
 * File: manufacturing-product-options.service.ts
 * Path: src\modules\manufacturing\services\manufacturing-product-options.service.ts
 *
 * Формує список виробів для Manufacturing Web UI
 * за вибраним будинком.
 *
 * Джерело: 13_Placement через PlacementRepository.
 * Статус Placement на цьому етапі не фільтрується.
 * ==========================================================
 */

import { IPlacementRepository } from '../../placement/placement.repository.interface';
import { ManufacturingOption } from '../types/manufacturing-option';

export class ManufacturingProductOptionsService {
  constructor(private readonly placementRepository: IPlacementRepository) {}

  public getOptions(houseCode: string): ManufacturingOption[] {
    const placements = this.placementRepository.findByHouseCode(houseCode);

    const productCodes = new Set<string>();

    for (const placement of placements) {
      const productCode = placement.productCode.trim();

      if (productCode) {
        productCodes.add(productCode);
      }
    }

    return Array.from(productCodes).map((productCode) => ({
      value: productCode,
      label: productCode,
    }));
  }
}
