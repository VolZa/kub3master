import { MaterialBatchRepository } from '../../domain/materials/material-batch.repository';
import { GoogleSheetsMaterialBatchDataSource } from '../../infrastructure/sheets/materials/GoogleSheetsMaterialBatchDataSource';

import { sheetProvider } from './infrastructure.factory';

let repository: MaterialBatchRepository | null = null;

export function getMaterialBatchRepository(): MaterialBatchRepository {
  if (!repository) {
    const dataSource = new GoogleSheetsMaterialBatchDataSource(sheetProvider);

    repository = new MaterialBatchRepository(dataSource.getRows());
  }

  return repository;
}
// import { MaterialBatchRepository } from '../../domain/materials/material-batch.repository';
// import { MaterialBatchRepository } from '../../infrastructure/sheets/materials/MaterialBatchRepository';

// import { sheetProvider } from './infrastructure.factory';

// let repository: MaterialBatchRepository | null = null;

// export function getMaterialBatchRepository(): MaterialBatchRepository {
//   if (!repository) {
//     const dataSource = new MaterialBatchRepository(sheetProvider);

//     repository = new MaterialBatchRepository(dataSource.getRows());
//   }

//   return repository;
// }
