// src\modules\bom\repositories\bom-matrix-columns.repository.ts
import { BOMMatrixColumnDefinition } from '../model/bom-matrix-column-definition.model';

export interface BOMMatrixColumnsRepository {
  getAll(): BOMMatrixColumnDefinition[];

  getActive(matrixCode: string): BOMMatrixColumnDefinition[];

  // наразі не використовується, але може знадобитися в майбутньому
  //   findByColumnCode(
  //     matrixCode: string,
  //     columnCode: string,
  //   ): BOMMatrixColumnDefinition | null;

  findByMaterialId(
    matrixCode: string,
    materialId: string,
  ): BOMMatrixColumnDefinition | null;
}
