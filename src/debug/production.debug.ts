// src/debug/sync.debug.ts

import { ProductionSynchronizationStatus } from 'modules/synchronization/operational/production-synchronization.status';
import { getOperationalSynchronizationService } from '../app/factories/operational-synchronization.factory';
import { ProductionSynchronizationReport } from '../modules/synchronization/operational/production-synchronization-report';
import { DEFAULT_HOUSE_ID } from 'config/config';

export function runProductionSynchronizationTest(): void {
  const service = getOperationalSynchronizationService();

  const results = service.analyze(DEFAULT_HOUSE_ID);

  service.approveMatched(results);

  service.executeApproved(results);

  ProductionSynchronizationReport.print(results);
}
