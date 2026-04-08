import { ParsedSpec } from '../model/parsed-spec.model';

export function parseRebar(input: string): ParsedSpec {
  const normalized = input
    .replace(/І/g, '1')
    .replace(/ВР-?1/i, 'A240') // або твоя логіка
    .replace(/А500С/i, 'A500C')
    .toLowerCase()
    .replace(/ø|⌀/g, 'd') // різні символи діаметра
    .replace(/а/g, 'a') // кирилична "а"
    .replace(/с/g, 'c') // для A500C

    .trim();

  // ===== Діаметр =====
  const diameterMatch = normalized.match(/d\s*(\d+)/);
  const diameter = diameterMatch ? Number(diameterMatch[1]) : undefined;

  // ===== Клас =====

  const classMatch = normalized.match(/a\d{3,4}c?/);
  const className = classMatch ? classMatch[0].toUpperCase() : undefined;
  console.log('🧩 parseАрматура classMatch:', JSON.stringify(classMatch));
  console.log('🧩 parseАрматура className:', JSON.stringify(className));
  // ===== Довжина =====
  const lengthMatch = normalized.match(/l\s*=?\s*(\d+)/);
  const length = lengthMatch ? Number(lengthMatch[1]) : undefined;

  // ===== Валідація =====
  if (!diameter) {
    return { kind: 'unknown' };
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
