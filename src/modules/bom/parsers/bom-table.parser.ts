// src\modules\bom\parsers\bom-table.parser.ts
import { debug } from '../../../utils/debug';

type CreateBOMInput = {
  parentCode: string;
  specification: string;
};

function _createBOM(data: CreateBOMInput): string {
  console.log('RAW SPEC:\n' + data.specification);

  const lines = data.specification.split('\n');

  const parsed = lines.map((line) => {
    const parts = line.trim().split(' ');
    return {
      name: parts.slice(0, -1).join(' '),
      qty: Number(parts[parts.length - 1]),
    };
  });

  console.log('PARSED:', JSON.stringify(parsed, null, 2));

  return `Parsed ${parsed.length} items`;
}

export const createBOM = debug('createBOM', _createBOM);
