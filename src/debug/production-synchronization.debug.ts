// src/debug/sync.debug.ts
import { DEFAULT_HOUSE_ID } from 'config/config';
import { getOperationalSynchronizationService } from '../app/factories/operational-synchronization.factory';
import { ProductionSynchronizationReport } from '../modules/synchronization/operational/production-synchronization-report';

export function previewProductionSynchronization(): void {
  const service = getOperationalSynchronizationService();

  // 1. Аналіз
  const results = service.analyze(DEFAULT_HOUSE_ID);

  // 2. Тимчасово автоматично затверджуємо
  service.approveMatched(results);

  // 3. Виводимо Preview
  ProductionSynchronizationReport.print(results);

  // 4. Поки що execute НЕ викликаємо
  service.execute(results);
}
