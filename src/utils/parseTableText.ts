import { TableRowInput } from '../modules/bom/model/table-row-input.model';

export function parseTableText(text: string): TableRowInput[] {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const result: TableRowInput[] = [];

  for (const line of lines) {
    const parts = line.split('|').map((p) => p.trim());

    // 1 колонка
    if (parts.length === 1) {
      result.push({
        name: parts[0],
      });
      continue;
    }

    // 2 колонки → name | qty
    if (parts.length === 2) {
      result.push({
        name: parts[0],
        qty: Number(parts[1]),
      });
      continue;
    }

    // 3 колонки → designation | name | qty
    if (parts.length === 3) {
      result.push({
        designation: parts[0],
        name: parts[1],
        qty: Number(parts[2]),
      });
      continue;
    }
  }

  return result;
}
