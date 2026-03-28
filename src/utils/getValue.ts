export function getValue<T = any>(
  row: any[],
  map: Record<string, number>,
  key: string,
): T | undefined {
  const col = map[key];
  if (col === undefined) return undefined;
  return row[col];
}
