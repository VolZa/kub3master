import { SheetProvider } from '../SheetProvider';
import { SheetKey } from '../SheetKey';
import { GoogleSheetsDataSource } from '../GoogleSheetsDataSource';
export class GoogleSheetsMaterialBatchDataSource extends GoogleSheetsDataSource {
  constructor(sheetProvider: SheetProvider) {
    super(sheetProvider, SheetKey.MATERIAL_BATCHES);
  }
}
// export class GoogleSheetsMaterialBatchDataSource {
//   constructor(private readonly sheetProvider: SheetProvider) {}

//   getRows(): unknown[][] {
//     return this.sheetProvider
//       .get(SheetKey.MATERIAL_BATCHES)
//       .getDataRange()
//       .getValues();
//   }
// }
