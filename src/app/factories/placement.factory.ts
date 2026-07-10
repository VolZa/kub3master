import { PlacementInMemoryRepository } from '../../modules/placement/placement.repository';
import { GoogleSheetsPlacementDataSource } from '../../infrastructure/sheets/placement/GoogleSheetsPlacementDataSource';
// import { mapRowToPlacement } from '../../modules/placement/placement.mapper';
import { PlacementRow } from '../../modules/placement/placement.row';

import { sheetProvider } from './infrastructure.factory';
import { mapSheetRowToPlacement } from '../../modules/placement/placement.mapper';
import { createColumnMap } from '../../utils/column-mapper';

let repository: PlacementInMemoryRepository | null = null;

export function getPlacementRepository(): PlacementInMemoryRepository {
  if (!repository) {
    const dataSource = new GoogleSheetsPlacementDataSource(sheetProvider);
    const rows = dataSource.getRows();
    const [headers, ...values] = rows;
    const columnMap = createColumnMap(headers as string[]);
    const placements = values.map((row) =>
      mapSheetRowToPlacement(row, columnMap),
    );

    repository = new PlacementInMemoryRepository(placements, dataSource);
  }

  return repository;
}
