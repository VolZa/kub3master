import { SheetKey } from '../SheetKey';
import { SheetProvider } from '../SheetProvider';

export class GoogleSheetsCatalogDataSource {
  // export class CatalogRepository {
  constructor(private readonly sheetProvider: SheetProvider) {}

  getRows(): unknown[][] {
    return this.sheetProvider.get(SheetKey.CATALOG).getDataRange().getValues();
  }

  appendRow(row: unknown[]): void {
    this.sheetProvider.get(SheetKey.CATALOG).appendRow(row);
  }
}
// import { SheetKey } from '../SheetKey';
// import { sheetProvider } from '../SheetProvider';

// export class CatalogRepository {
//   private get sheet() {
//     return sheetProvider.get(SheetKey.CATALOG);
//   }

//   getRows(): unknown[][] {
//     return this.sheet.getDataRange().getValues();
//   }

//   appendRow(row: unknown[]): void {
//     this.sheet.appendRow(row);
//   }
// }

// export class CatalogRepository {
//   getRows(): unknown[][] {
//     const sheet = sheetProvider.get(SheetKey.CATALOG);

//     return sheet.getDataRange().getValues();
//   }

//   appendRow(row: unknown[]): void {
//     const sheet = sheetProvider.get(SheetKey.CATALOG);

//     sheet.appendRow(row);
//   }
// }
// import { getSheetByNameSafe } from '../../../utils/sheets';

// export class CatalogRepository {
//   private readonly SHEET_NAME = '04_Catalog';

//   getRows(): any[][] {
//     const sheet = getSheetByNameSafe(this.SHEET_NAME);
//     return sheet.getDataRange().getValues();
//   }

//   appendRow(row: any[]) {
//     const sheet = getSheetByNameSafe(this.SHEET_NAME);
//     sheet.appendRow(row);
//   }
// }
