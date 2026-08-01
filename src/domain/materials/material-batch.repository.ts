// src/domain/materials/material-batch.repository.ts

// src/domain/materials/material-batch.repository.ts

import { MaterialBatch } from './material-batch.model';
import { mapRowsToMaterialBatches } from './material-batch.mapper';
import { MaterialBatchRow } from '../../modules/material-batch/material-batch.row';

export class MaterialBatchRepository {
  private batches: MaterialBatch[];

  constructor(rows: readonly MaterialBatchRow[]) {
    this.batches = mapRowsToMaterialBatches(rows);
  }

  findActiveByMaterialId(materialId: string): MaterialBatch | null {
    return (
      this.batches.find((b) => b.materialId === materialId && b.isActive) ||
      null
    );
  }

  findAllByMaterialId(materialId: string): MaterialBatch[] {
    return this.batches.filter((b) => b.materialId === materialId);
  }
}
