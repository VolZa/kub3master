import { ParsedSpec } from '../model/parsed-spec.model';
import { parseLength } from './utils/parseLength';

export function parseAngle(input: string): ParsedSpec | null {
  // Нормалізуємо роздільник "х"
  const normalized = input.replace(/[xXхХ]/g, 'x');

  // Прибираємо довжину із рядка
  const geometry = normalized.replace(/,\s*l\s*=\s*\d+/i, '').trim();

  const parts = geometry.split('x').map((v) => Number(v.trim()));

  let width: number;
  let height: number;
  let thickness: number;

  switch (parts.length) {
    case 2:
      // ADR-038
      // 100x7 → 100x100x7
      width = parts[0];
      height = parts[0];
      thickness = parts[1];
      break;

    case 3:
      // 100x63x8
      width = parts[0];
      height = parts[1];
      thickness = parts[2];
      break;

    default:
      return null;
  }

  const length = parseLength(normalized);

  return {
    kind: 'angle',
    width,
    height,
    thickness,
    length,
  };
}
// import { ParsedSpec } from '../model/parsed-spec.model';

// export function parseAngle(input: string): ParsedSpec | null {
//   // 🔥 шукаємо 100x63x8
//   const match = input.match(/(\d+)[xX](\d+)[xX](\d+)/);

//   if (!match) return null;

//   const width = Number(match[1]);
//   const height = Number(match[2]);
//   const thickness = Number(match[3]);

//   // 🔥 шукаємо довжину
//   const lengthMatch = input.match(/l\s*=\s*(\d+)/i);
//   const length = lengthMatch ? Number(lengthMatch[1]) : undefined;

//   return {
//     kind: 'angle',
//     width,
//     height,
//     thickness,
//     length,
//   };
// }
