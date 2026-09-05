// src / app / factories / bom - matrix - columns.factory.ts;
import { InMemoryBOMMatrixColumnsRepository } from '../../modules/bom/repositories/in-memory-bom-matrix-columns.repository';
import { GoogleSheetsBOMMatrixColumnsDataSource } from '../../infrastructure/sheets/bom/GoogleSheetsBOMMatrixColumnsDataSource';
import { mapRowsToBOMMatrixColumnDefinitions } from '../../modules/bom/bom-matrix-column-definition.mapper';
import { BOMMatrixColumnsRepository } from '../../modules/bom/repositories/bom-matrix-columns.repository';
import { sheetProvider } from './infrastructure.factory'; //'../../infrastructure/sheets/SheetProvider';

let repository: BOMMatrixColumnsRepository | null = null;

export function getBOMMatrixColumnsRepository(): BOMMatrixColumnsRepository {
  if (!repository) {
    const dataSource = new GoogleSheetsBOMMatrixColumnsDataSource(
      sheetProvider,
    );

    const rows = dataSource.getRows();

    const columns = mapRowsToBOMMatrixColumnDefinitions(rows);

    repository = new InMemoryBOMMatrixColumnsRepository(columns);
  }

  return repository;
}
