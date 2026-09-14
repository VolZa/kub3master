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
