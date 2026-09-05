/**
 * ==========================================================
 * ERP КУБ
 * Module: BOM
 * File: bom-matrix-column-definition.row.ts
 * Path: src\modules\bom\bom-matrix-column-definition.row.ts
 * Рядок таблиці Google Sheets: BOMMatrixColumns
 * ==========================================================
 */

export interface BOMMatrixColumnDefinitionRow {
  ID: string;
  MatrixCode: string;
  ColumnCode: string;
  MaterialID: string;
  Title: string;
  Unit: string;
  SortOrder: number;
  IsActive: boolean;
  Comment: string;
}
