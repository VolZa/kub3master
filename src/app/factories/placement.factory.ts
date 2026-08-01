// src/app/factories/placement.factory.ts

import { PlacementInMemoryRepository } from '../../modules/placement/placement.repository';
import { GoogleSheetsPlacementDataSource } from '../../infrastructure/sheets/placement/GoogleSheetsPlacementDataSource';
import { mapRowsToPlacements } from '../../domain/placement/placement.mapper';

import { sheetProvider } from './infrastructure.factory';

let repository: PlacementInMemoryRepository | null = null;

export function getPlacementRepository(): PlacementInMemoryRepository {
  if (!repository) {
    const dataSource = new GoogleSheetsPlacementDataSource(sheetProvider);

    const placements = mapRowsToPlacements(dataSource.getRows());

    repository = new PlacementInMemoryRepository(placements, dataSource);
  }

  return repository;
}

// // src\app\factories\placement.factory.ts
// import { PlacementInMemoryRepository } from '../../modules/placement/placement.repository';
// import { GoogleSheetsPlacementDataSource } from '../../infrastructure/sheets/placement/GoogleSheetsPlacementDataSource';

// import { sheetProvider } from './infrastructure.factory';
// // import { mapSheetRowToPlacement } from '../../domain/placement/placement.mapper';
// // import { createColumnMap } from '../../utils/column-mapper';
// import { mapRowsToPlacements } from '../../domain/placement/placement.mapper';

// let repository: PlacementInMemoryRepository | null = null;

// export function getPlacementRepository(): PlacementInMemoryRepository {
//   if (!repository) {
//     const dataSource = new GoogleSheetsPlacementDataSource(sheetProvider);
//     const rows = dataSource.getRows();
//     const [headers, ...values] = rows;
//     const columnMap = createColumnMap(headers as string[]);
//     const placements = values.map((row) =>
//       mapSheetRowToPlacement(row, columnMap),
//     );

//     repository = new PlacementInMemoryRepository(placements, dataSource);
//   }

//   return repository;
// }
