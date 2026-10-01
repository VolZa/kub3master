import { MaterialRepository } from '../../domain/materials/material.repository';
import { GoogleSheetsMaterialDataSource } from '../../infrastructure/sheets/material/GoogleSheetsMaterialDataSource';

import { sheetProvider } from './infrastructure.factory';

let repository: MaterialRepository | null = null;

export function getMaterialRepository(): MaterialRepository {
  if (!repository) {
    const dataSource = new GoogleSheetsMaterialDataSource(sheetProvider);

    repository = new MaterialRepository(dataSource.getRows());
  }

  return repository;
}
