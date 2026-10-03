// src/domain/materials/material-batch.repository.ts

// src/domain/materials/material-batch.repository.ts

import { MaterialBatch } from './material-batch.model';
import { mapRowsToMaterialBatches } from './material-batch.mapper';
import { MaterialBatchRow } from '../../modules/material-batch/material-batch.row';
import { MaterialBatchOption } from '../../modules/material-batch/material-batch-option';
export class MaterialBatchRepository {
  private batches: MaterialBatch[];

  constructor(rows: readonly MaterialBatchRow[]) {
    this.batches = mapRowsToMaterialBatches(rows);
  }

  private createOptionLabel(batch: MaterialBatch): string {
    return `${batch.batchCode ?? batch.batchId} — ${batch.remainingQty ?? 0}`;
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

  /**
   * Повертає доступні партії конкретного матеріалу
   * для ручного вибору у UI.
   */
  public getMaterialBatchOptions(materialId: string): MaterialBatchOption[] {
    return this.findAllByMaterialId(materialId)
      .filter((batch) => batch.isActive && (batch.remainingQty ?? 0) > 0)
      .map((batch) => ({
        batchId: batch.batchId,
        batchCode: batch.batchCode ?? '',
        materialId: batch.materialId,

        receivedAt: batch.receivedAt ? batch.receivedAt.toISOString() : '',

        remainingQty: batch.remainingQty ?? 0,

        weightPerMeter: batch.weightPerMeter,
        length: batch.length,

        label: this.createOptionLabel(batch),
      }));
  }
}
