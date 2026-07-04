import { SheetProvider } from '../SheetProvider';
import { SheetKey } from '../SheetKey';

export class GoogleSheetsMaterialBatchDataSource {
  constructor(private readonly sheetProvider: SheetProvider) {}

  getRows(): unknown[][] {
    return this.sheetProvider
      .get(SheetKey.MATERIAL_BATCHES)
      .getDataRange()
      .getValues();
  }
}
