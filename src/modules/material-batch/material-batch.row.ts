/**
 * Заголовки таблиці 06_MaterialBatches.
 * src\modules\material-batch\material-batch.row.ts
 * Порядок елементів визначає порядок колонок під час запису.
 */

export interface MaterialBatchRow {
  BatchID: string;
  MaterialID: string;
  BatchCode: string;
  Supplier: string;
  ReceivedAt: string | Date;
  WeightPerMeter: number;
  Length: number;
  Quantity: number;
  RemainingQty: number;
  IsActive: boolean;
  Comment: string;
}
