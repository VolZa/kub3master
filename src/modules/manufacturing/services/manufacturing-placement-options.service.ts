/**
 * ==========================================================
 * ERP КУБ
 * Module: Manufacturing
 * File: manufacturing-placement-options.service.ts
 * Path: src\modules\manufacturing\services\manufacturing-placement-options.service.ts
 *
 * Формує список доступних позицій для Manufacturing Web UI
 * за вибраними HouseCode та ProductCode.
 *
 * Джерело: 13_Placement через PlacementRepository.
 *
 * Для нового виробництва доступні позиції зі статусами:
 * NONE та REJECTED.
 * ==========================================================
 */

import { IPlacementRepository } from '../../placement/placement.repository.interface';
import { PlacementStatus } from '../../../domain/placement/placement.status';
import { ManufacturingOption } from '../types/manufacturing-option';

export class ManufacturingPlacementOptionsService {
  constructor(private readonly placementRepository: IPlacementRepository) {}

  public getOptions(
    houseCode: string,
    productCode: string,
  ): ManufacturingOption[] {
    const normalizedHouseCode = houseCode.trim();
    const normalizedProductCode = productCode.trim();

    const placements = this.placementRepository
      .findByHouseCode(normalizedHouseCode)
      .filter(
        (placement) =>
          placement.productCode.trim() === normalizedProductCode &&
          (placement.status === PlacementStatus.NONE ||
            placement.status === PlacementStatus.REJECTED),
      );

    return placements.map((placement) => ({
      value: String(placement.id),
      label: this.buildLabel(placement),
    }));
  }

  private buildLabel(placement: {
    id: number;
    location: {
      section: string;
      floor: number;
      axis: string;
    };
  }): string {
    return [
      placement.id,
      `секція ${placement.location.section}`,
      `поверх ${placement.location.floor}`,
      placement.location.axis,
    ].join(' — ');
  }
}
