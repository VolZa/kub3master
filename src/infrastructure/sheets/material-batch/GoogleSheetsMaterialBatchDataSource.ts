import { SheetProvider } from '../SheetProvider';
import { SheetKey } from '../SheetKey';
import { GoogleSheetsDataSource } from '../GoogleSheetsDataSource';

import { MaterialBatchRow } from '../../../modules/material-batch/material-batch.row';
import { MATERIAL_BATCH_HEADERS } from '../../../modules/material-batch/material-batch.headers';

export class GoogleSheetsMaterialBatchDataSource extends GoogleSheetsDataSource<MaterialBatchRow> {
  constructor(sheetProvider: SheetProvider) {
    super(sheetProvider, SheetKey.MATERIAL_BATCHES, MATERIAL_BATCH_HEADERS);
  }
}
