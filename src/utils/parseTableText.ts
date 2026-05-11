import { TableRowInput } from '../modules/bom/model/table-row-input.model';
import { normalizeNumberString } from './normalize';

export function parseTableText(text: string): TableRowInput[] {
  console.log('👉 START parseTableText');
  console.log('TEXT:', text);
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  console.log('const lines:', lines);
  const result: TableRowInput[] = [];

  for (const line of lines) {
    const parts = line.split(';').map((p) => p.trim());

    // 1 колонка
    if (parts.length === 1) {
      result.push({
        codeEl: parts[0],
      });
      continue;
    }

    // 2 колонки → code | qty
    if (parts.length === 2) {
      result.push({
        codeEl: parts[0],
        // qty: Number(parts[1]),
        qty: normalizeNumberString(parts[1]),
      });
      continue;
    }

    // 3 колонки → prefix | code | qty
    if (parts.length === 3) {
      result.push({
        prefix: parts[0],
        codeEl: parts[1],
        qty: normalizeNumberString(parts[2]),
      });
      continue;
    }

    // 4 колонки → prefix | code | sufix | qty
    if (parts.length === 4) {
      result.push({
        prefix: parts[0],
        codeEl: parts[1],
        sufix: parts[2],
        qty: normalizeNumberString(parts[3]),
      });
      continue;
    }
  }

  return result;
}
