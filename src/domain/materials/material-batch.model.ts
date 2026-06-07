// src/domain/materials/material-batch.model.ts

export interface MaterialBatch {
  batchId: string;
  materialId: string;

  batchCode?: string;
  supplier?: string;

  receivedAt?: Date;

  weightPerMeter?: number;

  length?: number;

  quantity?: number;
  remainingQty?: number;

  isActive: boolean;

  comment?: string;
}
