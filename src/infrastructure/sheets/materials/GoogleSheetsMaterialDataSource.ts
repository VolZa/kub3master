import { SheetKey } from '../SheetKey';
import { SheetProvider } from '../SheetProvider';

export class GoogleSheetsMaterialDataSource {
  constructor(private readonly sheetProvider: SheetProvider) {}

  getRows(): unknown[][] {
    return this.sheetProvider
      .get(SheetKey.MATERIALS)
      .getDataRange()
      .getValues();
  }
}

// export class GoogleSheetsMaterialDataSource {
//   private sheetName = '05_Materials';

//   getRows(): any[][] {
//     const sheet = SpreadsheetApp.getActive().getSheetByName(this.sheetName);

//     if (!sheet) {
//       throw new Error(`Sheet not found: ${this.sheetName}`);
//     }

//     return sheet.getDataRange().getValues();
//   }
// }
