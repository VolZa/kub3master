import { TableRowInput } from '../../model/table-row-input.model';
import { StructuredLine } from '../model/structured-line.model';

export function mapTableRowToStructured(row: TableRowInput): StructuredLine {
  return {
    prefix: row.prefix ?? '',
    code: row.code,
    // suffix: row.sufix,
    qty: row.qty ?? 1,
  };
}
