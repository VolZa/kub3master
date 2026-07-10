import { PlacementSelectionService } from '../../modules/placement/placement-selection.service';

import { getPlacementRepository } from './placement.factory';

let service: PlacementSelectionService | null = null;

export function getPlacementSelectionService(): PlacementSelectionService {
  if (!service) {
    service = new PlacementSelectionService(getPlacementRepository());
  }

  return service;
}
