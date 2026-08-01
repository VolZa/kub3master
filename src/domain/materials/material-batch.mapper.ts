// src/domain/materials/material-batch.mapper.ts

import { MaterialBatch } from './material-batch.model';
import { MaterialBatchRow } from '../../modules/material-batch/material-batch.row';

function normalizeBoolean(v: unknown): boolean {
  return v === true || v === 'TRUE' || v === 1;
}

// export function mapRowsToBatches(rows: any[][]): MaterialBatch[] {
//   const headers = rows[0];
//   const data = rows.slice(1);

//   const col = (name: string) => {
//     const i = headers.indexOf(name);
//     if (i === -1) throw new Error(`Column not found: ${name}`);
//     return i;
//   };

//   const idx = {
//     id: col('BatchID'),
//     materialId: col('MaterialID'),
//     batchCode: col('BatchCode'),
//     supplier: col('Supplier'),
//     receivedAt: col('ReceivedAt'),
//     weightPerMeter: col('WeightPerMeter'),
//     length: col('Length'),
//     qty: col('Quantity'),
//     remain: col('RemainingQty'),
//     active: col('IsActive'),
//     comment: col('Comment'),
//   };

//   return data.map((row) => ({
//     batchId: String(row[idx.id]),
//     materialId: String(row[idx.materialId]),

//     batchCode: String(row[idx.batchCode] || ''),

//     supplier: row[idx.supplier] || undefined,
//     receivedAt: row[idx.receivedAt] ? new Date(row[idx.receivedAt]) : undefined,

//     weightPerMeter: (() => {
//       const raw = row[idx.weightPerMeter];

//       if (raw === undefined || raw === '') return undefined;

//       const normalized = String(raw).replace(',', '.');

//       const num = Number(normalized);

//       return isNaN(num) ? undefined : num;
//     })(),
//     // weightPerMeter: row[idx.weightPerMeter]
//     //   ? Number(String(row[idx.weightPerMeter]).replace(',', '.'))
//     //   : undefined,

//     length: row[idx.length] ? Number(row[idx.length]) : undefined,

//     quantity: row[idx.qty] ? Number(row[idx.qty]) : undefined,
//     remainingQty: row[idx.remain] ? Number(row[idx.remain]) : undefined,

//     isActive: normalizeBoolean(row[idx.active]),

//     comment: row[idx.comment] || undefined,
//   }));
// }

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
