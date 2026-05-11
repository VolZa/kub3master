// src/domain/materials/googleSheetsMaterialBatch.repository.ts

import { getSheetByNameSafe } from '../../utils/sheets';
import { mapRowsToBatches } from './material-batch.mapper';
import { MaterialBatchRepository } from './material-batch.repository';

export class GoogleSheetsMaterialBatchRepository extends MaterialBatchRepository {
  constructor() {
    const sheet = getSheetByNameSafe('06_MaterialBatches');
    const rows = sheet.getDataRange().getValues();

    const batches = mapRowsToBatches(rows);

    super(batches);
  }
}
