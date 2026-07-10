import { getOperationalSynchronizationService } from '../app/factories/operational-synchronization.factory';
import { ProductionSynchronizationReport } from '../modules/synchronization/operational/production-synchronization-report';
import { DEFAULT_HOUSE_ID } from 'config/config';

export function analyzeProduction(): void {
  const service = getOperationalSynchronizationService();

  const results = service.analyze(DEFAULT_HOUSE_ID);

  ProductionSynchronizationReport.print(results);
}

export function executeProduction(): void {
  const service = getOperationalSynchronizationService();

  const results = service.analyze(DEFAULT_HOUSE_ID);

  service.approveMatched(results);

  service.execute(results);

  ProductionSynchronizationReport.print(results);

  SpreadsheetApp.getUi().alert(
    `Оновлено ${results.filter((r) => r.approved).length} виробів.`,
  );
}
