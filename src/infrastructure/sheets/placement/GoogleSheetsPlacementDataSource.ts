import { SheetKey } from '../SheetKey';
import { SheetProvider } from '../SheetProvider';
import { GoogleSheetsDataSource } from '../GoogleSheetsDataSource';

export class GoogleSheetsPlacementDataSource extends GoogleSheetsDataSource {
  constructor(sheetProvider: SheetProvider) {
    super(sheetProvider, SheetKey.PLACEMENT);
  }
}
// export class GoogleSheetsPlacementDataSource {
//   constructor(private readonly sheetProvider: SheetProvider) {}

//   getRows(): unknown[][] {
//     return this.sheetProvider
//       .get(SheetKey.PLACEMENT)
//       .getDataRange()
//       .getValues();
//   }

//   replaceRows(rows: unknown[][]): void {
//     const sheet = this.sheetProvider.get(SheetKey.PLACEMENT);

//     sheet.clearContents();

//     if (!rows.length) {
//       return;
//     }

//     sheet.getRange(1, 1, rows.length, rows[0].length).setValues(rows);
//   }

//   appendRow(row: unknown[]): void {
//     this.sheetProvider.get(SheetKey.PLACEMENT).appendRow(row);
//   }
// }
