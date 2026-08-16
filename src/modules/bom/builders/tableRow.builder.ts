import { BuiltElement } from '../../../domain/elements/built-element.model';
import { TableRowInput } from '../model/table-row-input.model';
import { generateCodeFromSpec } from '../../elements/utils/code.util';

export function buildFromTableRow(row: TableRowInput): BuiltElement {
  if (!row.prefix) {
    throw new Error(`Missing prefix in row: ${JSON.stringify(row)}`);
  }

  return {
    code: row.code ?? generateCodeFromSpec(row.prefix, row.spec),
    prefixName: row.prefix,
    name: row.spec,
  };
}
