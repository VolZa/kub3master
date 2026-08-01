import { getOperationalSynchronizationService } from 'app/factories/operational-synchronization.factory';
import { DEFAULT_HOUSE_ID } from 'config/config';
import { PlacementStatus } from '../domain/placement';

export function productionSynchronizationSmokeTest(): void {
  Logger.log('');
  Logger.log('==========================================');
  Logger.log('ERP КУБ :: Production Synchronization Smoke Test');
  Logger.log('==========================================');

  const service = getOperationalSynchronizationService();

  // Arrange
  const results = service.analyze(DEFAULT_HOUSE_ID);

  Logger.log('Analyze: %s records', results.length);

  // Assert
  if (results.length === 0) {
    throw new Error('Analyze returned 0 records.');
  }

  // Act
  service.approveMatched(results);

  service.execute(results);

  // Assert
  const produced = results.filter(
    (r) => r.approved && r.placement?.status === PlacementStatus.PRODUCED,
  );

  Logger.log('Produced: %s', produced.length);

  if (produced.length === 0) {
    throw new Error('Nothing was synchronized.');
  }

  Logger.log('✔ Smoke Test PASSED');
}
