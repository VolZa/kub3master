import { MaterialRepository } from '../../domain/materials/material.repository';
import { GoogleSheetsMaterialBatchDataSource } from '../../infrastructure/sheets/materials/GoogleSheetsMaterialBatchDataSource';

import { sheetProvider } from './infrastructure.factory';

let repository: MaterialRepository | null = null;

export function getMaterialRepository(): MaterialRepository {
  if (!repository) {
    const dataSource = new GoogleSheetsMaterialBatchDataSource(sheetProvider);

    repository = new MaterialRepository(dataSource.getRows());
  }

  return repository;
}
