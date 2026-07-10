import { OperationalSynchronizationService } from '../../modules/synchronization/operational/operational-synchronization.service';

import { getProductionImportService } from './production-import.factory';
import { getPlacementSelectionService } from './placement-selection.factory';
import { getPlacementRepository } from './placement.factory';

let service: OperationalSynchronizationService | null = null;

export function getOperationalSynchronizationService(): OperationalSynchronizationService {
  if (!service) {
    service = new OperationalSynchronizationService(
      getProductionImportService(),
      getPlacementSelectionService(),
      getPlacementRepository(),
    );
  }

  return service;
}
