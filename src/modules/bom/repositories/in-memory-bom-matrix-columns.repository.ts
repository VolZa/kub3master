// src\modules\bom\repositories\in-memory-bom-matrix-columns.repository.ts
import { BOMMatrixColumnDefinition } from '../model/bom-matrix-column-definition.model';
import { BOMMatrixColumnsRepository } from './bom-matrix-columns.repository';

export class InMemoryBOMMatrixColumnsRepository implements BOMMatrixColumnsRepository {
  constructor(private readonly columns: readonly BOMMatrixColumnDefinition[]) {}

  getAll(): BOMMatrixColumnDefinition[] {
    return [...this.columns];
  }

  getActive(matrixCode: string): BOMMatrixColumnDefinition[] {
    return this.columns
      .filter((column) => column.matrixCode === matrixCode && column.isActive)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }

  findByMaterialId(
    matrixCode: string,
    materialId: string,
  ): BOMMatrixColumnDefinition | null {
    return (
      this.columns.find(
        (column) =>
          column.matrixCode === matrixCode &&
          column.materialId === materialId &&
          column.isActive,
      ) ?? null
    );
  }
}
