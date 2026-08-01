// src/domain/materials/googleSheetsMaterialBatch.repository.ts

import { getSheetByNameSafe } from '../../utils/sheets';
import { mapRowsToMaterialBatches } from './material-batch.mapper';
import { MaterialBatchRepository } from './material-batch.repository';

export class GoogleSheetsMaterialBatchRepository extends MaterialBatchRepository {
  constructor() {
    const sheet = getSheetByNameSafe('06_MaterialBatches');
    const rows = sheet.getDataRange().getValues();
    const materialBatchRepo = new MaterialBatchRepository(rows);
    const batches = mapRowsToMaterialBatches(rows);

    super(rows);
  }
}
