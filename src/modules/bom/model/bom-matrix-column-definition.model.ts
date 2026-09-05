// src\modules\bom\model\bom-matrix-column-definition.model.ts
export interface BOMMatrixColumnDefinition {
  id: string;

  matrixCode: string;
  columnCode: string;

  materialId: string;

  title: string;
  unit: string;

  sortOrder: number;
  isActive: boolean;

  comment?: string;
}
