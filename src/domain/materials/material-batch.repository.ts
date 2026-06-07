// src/domain/materials/material-batch.repository.ts

// src/domain/materials/material-batch.repository.ts

import { MaterialBatch } from './material-batch.model';
import { mapRowsToMaterialBatches } from './material-batch.mapper';

export class MaterialBatchRepository {
  private items: MaterialBatch[];

  constructor(rows: any[][]) {
    this.items = mapRowsToMaterialBatches(rows);
  }

  findActiveByMaterialId(materialId: string): MaterialBatch | null {
    return (
      this.items.find((b) => b.materialId === materialId && b.isActive) || null
    );
  }

  findAllByMaterialId(materialId: string): MaterialBatch[] {
    return this.items.filter((b) => b.materialId === materialId);
  }
}

// import { MaterialBatch } from './material-batch.model';

// export class MaterialBatchRepository {
//   private batches: MaterialBatch[] = [];

//   constructor(batches: MaterialBatch[]) {
//     this.batches = batches;
//   }

//   getAll(): MaterialBatch[] {
//     return this.batches;
//   }

//   getByMaterial(materialId: string): MaterialBatch[] {
//     return this.batches.filter((b) => b.materialId === materialId);
//   }

//   getActiveBatch(materialId: string): MaterialBatch | null {
//     const batch = this.batches.find(
//       (b) => b.materialId === materialId && b.isActive,
//     );

//     return batch || null;
//   }
// }
