import { ElementShort } from '../elements/element.model';
import { StructuredLine } from './parsers/model/structured-line.model';
import { TableRowInput } from './model/table-row-input.model';

export function mapElementToBOMItem(child: ElementShort) {
  return {
    unit: child.baseUnit,
  };
}

export function mapTableRowToStructured(row: TableRowInput): StructuredLine {
  return {
    prefix: row.prefix ?? '',
    code: row.codeEl,
    suffix: row.sufix,
    qty: row.qty ?? 1,
  };
}
