import { mapRowToProductionRecord } from './production-import.mapper';

import { GoogleSheetsProductionDataSource } from '../../infrastructure/sheets/production/GoogleSheetsProductionDataSource';

import { ProductionRecord } from './production-record.model';
import { ProductionRow } from '../production/production.row';

export class ProductionImportService {
  constructor(private readonly dataSource: GoogleSheetsProductionDataSource) {}

  import(): ProductionRecord[] {
    const rows = this.dataSource.getRows();

    if (rows.length === 0) {
      return [];
    }

    return rows.filter(isNotEmptyRow).map(mapRowToProductionRecord);
  }
}

/* -------------------------------------------------------------------------- */

function isNotEmptyRow(row: ProductionRow): boolean {
  return Object.values(row).some((value) => String(value ?? '').trim() !== '');
}
