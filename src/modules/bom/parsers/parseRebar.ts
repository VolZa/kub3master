import { ParsedSpec } from '../model/parsed-spec.model';
import { normalizeRebarClass } from '../../../domain/materials/rebar.utils';
import { normalizeNumberString } from '../../../utils/normalize';

export function parseRebar(input: string): ParsedSpec | null {
  const lengthMatch = input.match(/L\s*=\s*([\d\s]+)/i);

  const length = lengthMatch
    ? normalizeNumberString(lengthMatch[1])
    : undefined;
  normalizeRebarClass(input);
  console.log('🧩 parseАрматура input:', JSON.stringify(input));

  const normalized = input
    .replace(/І/g, '1')
    .replace(/ВР-?1/i, 'A240') // або твоя логіка
    .replace(/А500С/i, 'A500C')
    .toLowerCase()
    .replace(/ø|⌀/g, 'd') // різні символи діаметра
    .replace(/а/g, 'a') // кирилична "а"
    .replace(/с/g, 'c') // для A500C

    .trim();
  console.log('🧩 parseАрматура normalized:', JSON.stringify(normalized));
  // ===== Діаметр =====
  let diameter: number | undefined;

  // 🔹 формат R_12_A500C
  const rMatch = normalized.match(/r[_\s]?(\d+)/i);

  // 🔹 формат d12
  const dMatch = normalized.match(/d\s*(\d+)/i);

  if (rMatch) {
    diameter = Number(rMatch[1]);
  } else if (dMatch) {
    diameter = Number(dMatch[1]);
  }
  // const diameter = diameterMatch ? Number(diameterMatch[1]) : undefined;
  console.log('🧩 parseАрматура diameter:', JSON.stringify(diameter));
  // ===== Клас =====

  // const classMatch = normalized.match(/a\d{3,4}c?/);
  let className: string | undefined;

  // 1️⃣ A500C
  const aClass = normalized.match(/a\d{3,4}c?/);

  // 2️⃣ ВР1 / ВР-1 / Вр-І
  const vrClass = normalized.match(/вр[-]?[1іi]/i);

  if (aClass) {
    className = aClass[0].toUpperCase();
  } else if (vrClass) {
    className = 'A240';
  }
  // const className = classMatch ? classMatch[0].toUpperCase() : undefined;
  // console.log('🧩 parseАрматура classMatch:', JSON.stringify(classMatch));
  console.log('🧩 parseАрматура className:', JSON.stringify(className));
  // ===== Довжина =====
  // const lengthMatch = normalized.match(/l\s*=?\s*(\d+)/);

  console.log('🧩 parseАрматура lengthMatch:', JSON.stringify(lengthMatch));

  // const length = lengthMatch ? Number(lengthMatch[1]) : undefined;

  // ===== Валідація =====
  // if (!diameter) {
  //   return { kind: 'unknown' };
  // }
  if (!diameter || !className) {
    return null;
  }
  return {
    kind: 'rebar',
    diameter,
    className,
    length,
  };
}

// import { ParsedSpec } from '../bom.parser';

// export function parseRebar(line: string): ParsedSpec | null {
//   const parts = line.split(' ');

//   if (parts.length < 2) return null;

//   // 12 A500 6000
//   if (/^\d+$/.test(parts[0])) {
//     return {
//       detected: true,
//       kind: 'rebar',
//       diameter: Number(parts[0]),
//       class: parts[1],
//       length: Number(parts[2] || 0),
//     };
//   }

//   return null;
// }
