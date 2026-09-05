// src / modules / bom / bom - matrix - column - definition.mapper.ts;
import { BOMMatrixColumnDefinition } from './model/bom-matrix-column-definition.model';
import { BOMMatrixColumnDefinitionRow } from './bom-matrix-column-definition.row';

function normalizeBoolean(value: unknown): boolean {
  return value === true || value === 'TRUE' || value === 1;
}

export function mapRowToBOMMatrixColumnDefinition(
  row: BOMMatrixColumnDefinitionRow,
): BOMMatrixColumnDefinition {
  return {
    id: String(row.ID).trim(),
    matrixCode: String(row.MatrixCode).trim(),
    columnCode: String(row.ColumnCode).trim(),
    materialId: String(row.MaterialID).trim(),
    title: String(row.Title).trim(),
    unit: String(row.Unit).trim(),
    sortOrder: Number(row.SortOrder),
    isActive: normalizeBoolean(row.IsActive),
    comment: String(row.Comment ?? '').trim() || undefined,
  };
}

export function mapRowsToBOMMatrixColumnDefinitions(
  rows: readonly BOMMatrixColumnDefinitionRow[],
): BOMMatrixColumnDefinition[] {
  return rows.map(mapRowToBOMMatrixColumnDefinition);
}
