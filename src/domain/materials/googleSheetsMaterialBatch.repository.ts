// src/domain/materials/googleSheetsMaterialBatch.repository.ts

import { getSheetByNameSafe } from '../../utils/sheets';
import { mapRowsToBatches } from './material-batch.mapper';
import { MaterialBatchRepository } from './material-batch.repository';

export class GoogleSheetsMaterialBatchRepository extends MaterialBatchRepository {
  constructor() {
    const sheet = getSheetByNameSafe('06_MaterialBatches');
    const rows = sheet.getDataRange().getValues();
    const materialBatchRepo = new MaterialBatchRepository(rows);
    const batches = mapRowsToBatches(rows);

    super(rows);
  }
}

// import { SheetProvider } from '../SheetProvider';
// import { SheetKey } from '../SheetKey';

// export class MaterialBatchRepository {
//   constructor(private readonly sheetProvider: SheetProvider) {}

//   getRows(): unknown[][] {
//     return this.sheetProvider
//       .get(SheetKey.MATERIAL_BATCHES)
//       .getDataRange()
//       .getValues();
//   }
// }
