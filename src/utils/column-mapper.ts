/**
 * Створює мапу колонок по header row
 */
export function createColumnMap(headers: string[]) {
  const map: Record<string, number> = {};

  headers.forEach((h, i) => {
    if (!h) return;

    map[h.trim()] = i;
  });

  return map;
}

export function getValue(
  row: any[],
  map: Record<string, number>,
  field: string,
) {
  const index = map[field];

  if (index === undefined) {
    throw new Error(`Column not found: ${field}`);
  }

  return row[index];
}
