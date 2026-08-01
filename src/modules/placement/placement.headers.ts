/**
 * Заголовки таблиці 20_Houses
 * Path: src\modules\house\house.headers.ts
 * Порядок елементів визначає порядок колонок під час запису.
 */
export const PLACEMENT_HEADERS = [
  'PlacementId',
  'HouseId',
  'Section',
  'Floor',
  'Axis',
  'ProductCode',
  'Status',
  'Priority',
  'ScheduledDate',
  'ScheduledShift',
  'ProducedDate',
  'ProducedShift',
  'ShippedDate',
  'Comment',
] as const;
