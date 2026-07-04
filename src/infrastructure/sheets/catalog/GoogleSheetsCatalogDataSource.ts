import { GoogleSheetsDataSource } from '../GoogleSheetsDataSource';
import { SheetKey } from '../SheetKey';
import { SheetProvider } from '../SheetProvider';

export class GoogleSheetsCatalogDataSource extends GoogleSheetsDataSource {
  constructor(sheetProvider: SheetProvider) {
    super(sheetProvider, SheetKey.CATALOG);
  }
}

// export class GoogleSheetsCatalogDataSource {
//   // export class CatalogRepository {
//   constructor(private readonly sheetProvider: SheetProvider) {}

//   getRows(): unknown[][] {
//     return this.sheetProvider.get(SheetKey.CATALOG).getDataRange().getValues();
//   }

//   appendRow(row: unknown[]): void {
//     this.sheetProvider.get(SheetKey.CATALOG).appendRow(row);
//   }
// }
