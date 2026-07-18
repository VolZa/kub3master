//src\infrastructure\sheets\catalog\GoogleSheetsCatalogDataSource.ts

import { GoogleSheetsDataSource } from '../GoogleSheetsDataSource';
import { SheetKey } from '../SheetKey';
import { SheetProvider } from '../SheetProvider';
export class GoogleSheetsCatalogDataSource extends GoogleSheetsDataSource {
  constructor(sheetProvider: SheetProvider) {
    super(sheetProvider, SheetKey.CATALOG);
  }
}

// export class GoogleSheetsCatalogDataSource extends GoogleSheetsDataSource {
//   constructor(sheetProvider: SheetProvider) {
//     super(sheetProvider, SheetKey.CATALOG);
//   }
// }
