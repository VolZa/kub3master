import {
  normalizeNumberString,
  isNumericString,
} from '../../../utils/normalize';
import { extractLength } from './utils/spec.utils';

export function parseStructuredLine(line: string): {
  prefix: string;
  code: string;
  spec: string;
  qty: number;
  length?: number;
} {
  console.log('⚙️👉 parseStructuredLine:', line);

  const parts = line
    .split(';')
    .map((p) => p.trim())
    .filter(Boolean);

  const prefix = parts[0];
  let qty = 1;

  // 🔹 qty
  const lastPart = parts[parts.length - 1];
  if (isNumericString(lastPart)) {
    qty = normalizeNumberString(lastPart);
  }

  // 🔥 БЕТОН
  if (prefix.toLowerCase() === 'бетон') {
    const codePart = parts[1] || '';

    const match = codePart.match(/(.+),\s*(\w+)/);

    const code = match ? match[1].trim() : codePart;
    const spec = code;

    return {
      prefix,
      code,
      spec,
      qty,
    };
  }

  // 🔹 загальний випадок
  const code = parts[1] || '';
  const suffix = parts.length >= 4 ? parts[2] : '';

  let spec = code;

  if (suffix) {
    spec = `${code}, ${suffix}`;
  }

  const length = extractLength(line);

  return {
    prefix,
    code,
    spec,
    qty,
    length,
  };
}
// export function parseStructuredLine(line: string) {
//   console.log('⚙️👉 parseStructuredLine:', line);
//   const parts = line
//     .split(';')
//     .map((p) => p.trim())
//     .filter(Boolean);

//   const prefix = parts[0];

//   let code = '';
//   let suffix = '';
//   let qty = 1;
//   let baseUnit: string | undefined;
//   let length: number | undefined;

//   // 🔹 qty (останнє поле)
//   // qty = normalizeNumberString(parts[parts.length - 1]);
//   const lastPart = parts[parts.length - 1];
//   if (isNumericString(lastPart)) {
//     qty = normalizeNumberString(lastPart);
//   }

//   // 🔥 БЕТОН
//   if (prefix.toLowerCase() === 'бетон') {
//     const codePart = parts[1];

//     const match = codePart.match(/(.+),\s*(\w+)/);

//     if (match) {
//       code = match[1].trim();
//       baseUnit = match[2].trim(); // м3
//     } else {
//       code = codePart;
//     }

//     return { prefix, code, baseUnit, qty };
//   }

//   // 🔹 загальний випадок
//   code = parts[1];

//   if (parts.length >= 4) {
//     suffix = parts[2];
//   }

//   // 🔥 витягуємо довжину
//   length = extractLength(line);

//   return { prefix, code, suffix, qty, length };
// }
