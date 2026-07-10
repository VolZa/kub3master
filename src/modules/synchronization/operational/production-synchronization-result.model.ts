// src/modules/synchronization/operational/production-synchronization-result.model.ts

import { Placement } from '../../placement/placement.model';
import { ProductionRecord } from '../../productionImport/production-record.model';
import { ProductionSynchronizationStatus } from './production-synchronization.status';

export interface ProductionSynchronizationResult {
  /**
   * Запис журналу виробництва.
   */
  record: ProductionRecord;

  /**
   * Знайдений Placement.
   */
  placement?: Placement;

  /**
   * Результат аналізу.
   */
  status: ProductionSynchronizationStatus;

  /**
   * Ознака затвердження до виконання.
   */
  approved: boolean;

  /**
   * Діагностичне повідомлення.
   */
  message?: string;
}
