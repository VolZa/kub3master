import { ShiftPlanRepository } from '../../modules/shiftPlan/shift-plan.repository';

import { GoogleSheetsShiftPlanDataSource } from '../../infrastructure/sheets/shiftPlan/GoogleSheetsShiftPlanDataSource';

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
// import { ShiftPlanRepository } from '../../modules/shiftPlan/shift-plan.repository';

// import { GoogleSheetsShiftPlanDataSource } from '../../infrastructure/sheets/shiftPlan/GoogleSheetsShiftPlanDataSource';

// import { sheetProvider } from './infrastructure.factory';

// let repository: ShiftPlanRepository | null = null;

// export function getShiftPlanRepository(): ShiftPlanRepository {
//   if (!repository) {
//     const dataSource = new GoogleSheetsShiftPlanDataSource(sheetProvider);

//     repository = new ShiftPlanRepository(dataSource.getRows());
//   }

//   return repository;
// }
