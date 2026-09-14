/**
 * ==========================================================
 * ERP КУБ
 * Module: Manufacturing
 * File: manufacturing-house-options.service.ts
 * Path: src\modules\manufacturing\services\manufacturing-house-options.service.ts
 *
 * Формує список будинків для Manufacturing Web UI.
 * Джерело: 20_Houses через HouseRepository.
 * ==========================================================
 */

import { IHouseRepository } from '../../../domain/houses/house.repository';
import { ManufacturingOption } from '../types/manufacturing-option';

export class ManufacturingHouseOptionsService {
  constructor(private readonly houseRepository: IHouseRepository) {}

  public getOptions(): ManufacturingOption[] {
    const options: ManufacturingOption[] = [
      {
        value: '',
        label: 'NONE — поза проектом',
      },
    ];

    const activeHouses = this.houseRepository
      .findAll()
      .filter((house) => house.status === 'Active');

    for (const house of activeHouses) {
      options.push({
        value: house.code,
        label: `${house.code} — ${house.name}`,
      });
    }

    return options;
  }
}
