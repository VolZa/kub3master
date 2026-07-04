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
  row: readonly unknown[],
  map: Record<string, number>,
  field: string,
): unknown {
  const index = map[field];

  if (index === undefined) {
    throw new Error(`Column not found: ${field}`);
  }

  return row[index];
}

export function hasColumn(map: Record<string, number>, field: string): boolean {
  return field in map;
}
