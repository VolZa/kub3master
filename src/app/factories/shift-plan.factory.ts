// src\app\factories\shift-plan.factory.ts
import { ShiftPlanRepository } from '../../modules/shift-plan/shift-plan.repository';

import { GoogleSheetsShiftPlanDataSource } from '../../infrastructure/sheets/shift-plan/GoogleSheetsShiftPlanDataSource';

import { sheetProvider } from './infrastructure.factory';

let repository: ShiftPlanRepository | null = null;

/**
 * Повертає єдиний екземпляр репозиторію ShiftPlan.
 */
export function getShiftPlanRepository(): ShiftPlanRepository {
  if (!repository) {
    const dataSource = new GoogleSheetsShiftPlanDataSource(sheetProvider);

    repository = new ShiftPlanRepository(dataSource.getRows());
  }

  return repository;
}
