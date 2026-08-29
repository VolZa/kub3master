// src/domain/materials/material-batch.mapper.ts

import { MaterialBatch } from './material-batch.model';
import { MaterialBatchRow } from '../../modules/material-batch/material-batch.row';

function normalizeBoolean(v: unknown): boolean {
  return v === true || v === 'TRUE' || v === 1;
}

// src/domain/materials/material-batch.mapper.ts

export function mapRowsToMaterialBatches(
  rows: readonly MaterialBatchRow[],
): MaterialBatch[] {
  return rows.map((row) => ({
    batchId: row.BatchID,
    materialId: row.MaterialID,

    batchCode: row.BatchCode,

    supplier: row.Supplier || undefined,

    receivedAt: row.ReceivedAt ? new Date(row.ReceivedAt) : undefined,

    weightPerMeter:
      row.WeightPerMeter !== undefined ? Number(row.WeightPerMeter) : undefined,

    length: row.Length !== undefined ? Number(row.Length) : undefined,

    quantity: row.Quantity !== undefined ? Number(row.Quantity) : undefined,

    remainingQty:
      row.RemainingQty !== undefined ? Number(row.RemainingQty) : undefined,

    isActive: normalizeBoolean(row.IsActive),

    comment: row.Comment || undefined,
  }));
}
