// src/domain/materials/material-batch.mapper.ts

import { MaterialBatch } from './material-batch.model';

function normalizeBoolean(v: any): boolean {
  return v === true || v === 'TRUE' || v === 1;
}

export function mapRowsToBatches(rows: any[][]): MaterialBatch[] {
  const headers = rows[0];
  const data = rows.slice(1);

  const col = (name: string) => {
    const i = headers.indexOf(name);
    if (i === -1) throw new Error(`Column not found: ${name}`);
    return i;
  };

  const idx = {
    id: col('BatchID'),
    materialId: col('MaterialID'),
    batchCode: col('BatchCode'),
    supplier: col('Supplier'),
    receivedAt: col('ReceivedAt'),
    weight: col('WeightPerUnit'),
    length: col('Length'),
    qty: col('Quantity'),
    remain: col('RemainingQty'),
    active: col('IsActive'),
    comment: col('Comment'),
  };

  return data.map((row) => ({
    batchId: String(row[idx.id]),
    materialId: String(row[idx.materialId]),

    batchCode: String(row[idx.batchCode] || ''),

    supplier: row[idx.supplier] || undefined,
    receivedAt: row[idx.receivedAt] ? new Date(row[idx.receivedAt]) : undefined,

    weightPerUnit: Number(row[idx.weight]),

    length: row[idx.length] ? Number(row[idx.length]) : undefined,

    quantity: row[idx.qty] ? Number(row[idx.qty]) : undefined,
    remainingQty: row[idx.remain] ? Number(row[idx.remain]) : undefined,

    isActive: normalizeBoolean(row[idx.active]),

    comment: row[idx.comment] || undefined,
  }));
}
