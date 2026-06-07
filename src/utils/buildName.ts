import { TableRowInput } from '../modules/bom/model/table-row-input.model';
export function buildName(row: TableRowInput): string {
  return [row.prefix?.trim(), row.code?.trim()].filter(Boolean).join(' ');
}
