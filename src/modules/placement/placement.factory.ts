// src/modules/placement/placement.factory.ts
//Для майбутнього використання, якщо знадобиться створювати Placement з DTO
import { Placement } from '../../domain/placement/placement.model';
import { PlacementStatus } from '../../domain/placement/placement.status';

export interface CreatePlacementDto {
  id: number;
  houseCode: string;
  productCode: string;

  section: string;
  floor: number;
  axis: string;

  priority?: number;
}

export function createPlacement(dto: CreatePlacementDto): Placement {
  return {
    id: dto.id,

    houseCode: dto.houseCode,

    productCode: dto.productCode,

    location: {
      section: dto.section,
      floor: dto.floor,
      axis: dto.axis,
    },

    status: PlacementStatus.NONE,

    priority: dto.priority ?? 0,
  };
}
