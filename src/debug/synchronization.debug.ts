import { DEFAULT_HOUSE_ID } from 'config/config';
import { getOperationalSynchronizationService } from '../app/factories/operational-synchronization.factory';
import { ProductionSynchronizationReport } from '../modules/synchronization/operational/production-synchronization-report';

export function previewProductionSynchronization(): void {
  const service = getOperationalSynchronizationService();

  const results = service.analyze(DEFAULT_HOUSE_ID);

  service.approveMatched(results);

  service.executeApproved(results);

  ProductionSynchronizationReport.print(results);
}
