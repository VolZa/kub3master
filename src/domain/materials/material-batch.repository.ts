// src/domain/materials/material-batch.repository.ts

import { MaterialBatch } from './material-batch.model';

export class MaterialBatchRepository {
  private batches: MaterialBatch[] = [];

  constructor(batches: MaterialBatch[]) {
    this.batches = batches;
  }

  getAll(): MaterialBatch[] {
    return this.batches;
  }

  getByMaterial(materialId: string): MaterialBatch[] {
    return this.batches.filter((b) => b.materialId === materialId);
  }

  getActiveBatch(materialId: string): MaterialBatch | null {
    const batch = this.batches.find(
      (b) => b.materialId === materialId && b.isActive,
    );

    return batch || null;
  }
}
