import {
  createHeaderMap,
  mapSheetRowToProductionRecord,
} from './production-import.mapper';

import { GoogleSheetsProductionDataSource } from '../../infrastructure/sheets/production/GoogleSheetsProductionDataSource';

import { ProductionRecord } from './production-record.model';

export class ProductionImportService {
  constructor(private readonly dataSource: GoogleSheetsProductionDataSource) {}

  import(): ProductionRecord[] {
    const rows = this.dataSource.getRows();

    if (rows.length <= 1) {
      return [];
    }

    const headerMap = createHeaderMap(rows[0]);

    return rows
      .slice(1)
      .filter(isNotEmptyRow)
      .map((row) => mapSheetRowToProductionRecord(row, headerMap));
  }
}

/* -------------------------------------------------------------------------- */

function isNotEmptyRow(row: readonly unknown[]): boolean {
  return row.some((cell) => String(cell ?? '').trim() !== '');
}
// export class ProductionImportService {
//   constructor(private readonly dataSource: GoogleSheetsProductionDataSource) {}

//   import(): ProductionRecord[] {
//     const rows = this.dataSource.getRows();

//     if (rows.length <= 1) {
//       return [];
//     }

//     const headerMap = createHeaderMap(rows[0]);

//     return rows
//       .slice(1)
//       .filter(isNotEmptyRow)
//       .map((row) => mapSheetRowToProductionRecord(row, headerMap));
//   }
// }

// export class ProductionImportService {
//   constructor(private readonly dataSource: IProductionDataSource) {}

//   import(): ProductionRecord[] {
//     return this.dataSource.getRecords();
//   }
// }
