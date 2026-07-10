import { ShiftPlanItemRepository } from '../../modules/shiftPlan/shift-plan-item.repository';

import { GoogleSheetsShiftPlanItemDataSource } from '../../infrastructure/sheets/shiftPlan/GoogleSheetsShiftPlanItemDataSource';

import { sheetProvider } from './infrastructure.factory';

let repository: ShiftPlanItemRepository | null = null;

/**
 * Повертає єдиний екземпляр репозиторію рядків ShiftPlan.
 */
export function getShiftPlanItemRepository(): ShiftPlanItemRepository {
  if (!repository) {
    const dataSource = new GoogleSheetsShiftPlanItemDataSource(sheetProvider);

    repository = new ShiftPlanItemRepository(dataSource.getRows());
  }

  return repository;
}
// import { ShiftPlanItemRepository } from '../../modules/shiftPlan/shift-plan-item.repository';

// import { GoogleSheetsShiftPlanItemDataSource } from '../../infrastructure/sheets/shiftPlan/GoogleSheetsShiftPlanItemDataSource';

// import { sheetProvider } from './infrastructure.factory';

// let repository: ShiftPlanItemRepository | null = null;

// export function getShiftPlanItemRepository(): ShiftPlanItemRepository {
//   if (!repository) {
//     const dataSource = new GoogleSheetsShiftPlanItemDataSource(sheetProvider);

//     repository = new ShiftPlanItemRepository(dataSource.getRows());
//   }

//   return repository;
// }
