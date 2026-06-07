import { TableRowInput } from '../modules/bom/model/table-row-input.model';
import { parseStructuredLine } from '../modules/bom/parsers/parseStucturedLine';
import { normalizeNumberString } from './normalize';

export function parseTableText(text: string): TableRowInput[] {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  return lines.map((line) => parseStructuredLine(line));
}

// export function parseTableText(text: string): TableRowInput[] {
//   const lines = text
//     .split('\n')
//     .map((l) => l.trim())
//     .filter(Boolean);

//   return lines.map((line) => {
//     const parts = line.split(';').map((p) => p.trim());

//     if (parts.length < 3) {
//       throw new Error(`Invalid table row: ${line}`);
//     }

//     const prefix = parts[0];
//     const rawCode = parts[1];
//     const qtyRaw = parts[parts.length - 1];
//     const qty = normalizeNumberString(qtyRaw);
//     console.log('Parsed qty:', qty, 'from raw:', qtyRaw);

//     if (!prefix || !rawCode || !qty || qty <= 0) {
//       throw new Error(`Invalid table row: ${line}`);
//     }

//     let length: number | undefined;
//     const suffixParts: string[] = [];

//     for (const value of parts.slice(2, -1)) {
//       const lengthValue = parseLength(value);

//       if (lengthValue !== undefined) {
//         length = lengthValue;
//       } else if (value) {
//         suffixParts.push(value);
//       }
//     }

//     const codeEl = isRebarCode(rawCode)
//       ? buildElementCode(rawCode, length)
//       : rawCode.trim();

//     console.log(
//       'returned = Parsed codeEl:',
//       codeEl,
//       'from rawCode:',
//       rawCode,
//       'with length:',
//       length,
//     );
//     return lines.map((line) => parseStructuredLine(line));
//     // return lines.map((line) => parseStructuredLine(line));
//     //   {
//     //   const parsed = parseStructuredLine(line);

//     //   return parsed; // 🔥 просто повертаємо нову модель
//     // });
//     // return {
//     //   prefix,
//     //   codeEl,
//     //   rawCode,
//     //   sufix: suffixParts.length ? suffixParts.join(' ') : undefined,
//     //   qty,
//     //   length,
//     // };
//   });
// }

function isRebarCode(rawCode: string): boolean {
  return /[øØ]/.test(rawCode);
}

function parseLength(value: string): number | undefined {
  const match = value.match(/L\s*=\s*([\d\s,.]+)/i);

  return match ? normalizeNumberString(match[1]) : undefined;
}

function buildElementCode(rawCode: string, length?: number): string {
  const match = rawCode.match(/[øØ]\s*(\d+)\s*([A-Za-zА-Яа-я0-9]+)/);

  if (!match) {
    throw new Error(`Invalid rebar code: ${rawCode}`);
  }

  const diameter = match[1];
  const className = normalizeRebarClass(match[2]);
  const parts = ['R', diameter, className];

  if (length) {
    parts.push(`L${length}`);
  }

  return parts.join('_');
}

function normalizeRebarClass(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replace(/А/g, 'A')
    .replace(/В/g, 'B')
    .replace(/С/g, 'C');
}
