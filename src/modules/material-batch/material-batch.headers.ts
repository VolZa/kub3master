/**
 * Заголовки таблиці 06_MaterialBatches.
 *
 * Порядок елементів визначає порядок колонок під час запису.
 */
export const MATERIAL_BATCH_HEADERS = [
  'BatchID',
  'MaterialID',
  'BatchCode',
  'Supplier',
  'ReceivedAt',
  'WeightPerMeter',
  'Length',
  'Quantity',
  'RemainingQty',
  'IsActive',
  'Comment',
] as const;
