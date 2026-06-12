import { ParsedSpec } from '../model/parsed-spec.model';
import { normalizeRebarClass } from '../../../domain/materials/rebar.utils';
import { normalizeNumberString } from '../../../utils/normalize';
import { normalizeClassName } from '../../../utils/normalize';
import { normalizeNumeric, normalizeSpec } from './utils/spec.utils';
import { normalizePipeline } from '../normalizers/normalize.pipeline';

// export function parseRebar(input: string): ParsedSpec | null {
//   console.log('🧩 parseRebar input:', JSON.stringify(input));

//   // const normalized = normalizeNumeric(normalizeSpec(input));
//   const normalized = normalizePipeline(input);

//   console.log('🧩 parseRebar normalized:', JSON.stringify(normalized));

//   // ===== LENGTH =====
//   const lengthMatch = normalized.match(/L\s*=\s*(\d+)/i);
//   const length = lengthMatch
//     ? normalizeNumberString(lengthMatch[1])
//     : undefined;

//   // ===== DIAMETER =====
//   let diameter: number | undefined;

//   const rMatch = normalized.match(/R[_\s]?(\d+)/i);
//   const dMatch = normalized.match(/D\s*(\d+)/i);

//   if (rMatch) {
//     diameter = Number(rMatch[1]);
//   } else if (dMatch) {
//     diameter = Number(dMatch[1]);
//   }

//   // ===== CLASS =====
//   let className: string | undefined;

//   const aClass = normalized.match(/A\d{3,4}C?/);
//   const bpMatch = normalized.match(/BP[-\s]?1/);

//   if (aClass) {
//     className = normalizeClassName(aClass[0]);
//   } else if (bpMatch) {
//     className = normalizeClassName(bpMatch[0]);
//   }
//   // fallback

//   if (bpMatch) {
//     className = 'BP-1';
//   }

//   if (!diameter || !className) {
//     return null;
//   }

//   return {
//     kind: 'rebar',
//     diameter,
//     className,
//     length,
//   };
// }
export function parseRebar(input: string): ParsedSpec | null {
  console.log('🧩 parseRebar input:', JSON.stringify(input));

  const normalized = normalizePipeline(input);

  console.log('🧩 parseRebar normalized:', JSON.stringify(normalized));

  // ===== LENGTH =====
  const lengthMatch = normalized.match(/L\s*=\s*(\d+)/i);
  const length = lengthMatch
    ? normalizeNumberString(lengthMatch[1])
    : undefined;

  // ===== DIAMETER =====
  let diameter: number | undefined;

  const rMatch = normalized.match(/R[_\s]?(\d+)/i);
  const dMatch = normalized.match(/D(\d+)/i);

  if (rMatch) {
    diameter = Number(rMatch[1]);
  } else if (dMatch) {
    diameter = Number(dMatch[1]);
  }

  // ===== CLASS =====
  let className: string | undefined;

  const aClass = normalized.match(/A\d{3,4}C?/);
  // const bpMatch = normalized.match(/BP[-\s]?1/);
  const bpMatch = normalized.match(/BP[-\s]?[1I]/);

  if (aClass) {
    className = normalizeClassName(aClass[0]);
  } else if (bpMatch) {
    className = normalizeClassName(bpMatch[0]);
  }

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
// export function parseRebar(input: string): ParsedSpec | null {
//   const lengthMatch = input.match(/L\s*=\s*([\d\s]+)/i);

//   const length = lengthMatch
//     ? normalizeNumberString(lengthMatch[1])
//     : undefined;
//   normalizeRebarClass(input);
//   console.log('🧩 parseАрматура input:', JSON.stringify(input));

//   const normalized = input
//     .replace(/І/g, '1')
//     .replace(/ВР-?1/i, 'A240') // або твоя логіка
//     .replace(/А500С/i, 'A500C')
//     .toLowerCase()
//     .replace(/ø|⌀/g, 'd') // різні символи діаметра
//     .replace(/а/g, 'a') // кирилична "а"
//     .replace(/с/g, 'c') // для A500C

//     .trim();
//   console.log('🧩 parseАрматура normalized:', JSON.stringify(normalized));
//   // ===== Діаметр =====
//   let diameter: number | undefined;

//   // 🔹 формат R_12_A500C
//   const rMatch = normalized.match(/r[_\s]?(\d+)/i);

//   // 🔹 формат d12
//   const dMatch = normalized.match(/d\s*(\d+)/i);

//   if (rMatch) {
//     diameter = Number(rMatch[1]);
//   } else if (dMatch) {
//     diameter = Number(dMatch[1]);
//   }

//   console.log('🧩 parseАрматура diameter:', JSON.stringify(diameter));
//   // ===== Клас =====

//   let className: string | undefined;

//   // 1️⃣ A500C
//   const aClass = normalized.match(/a\d{3,4}c?/);

//   // 2️⃣ ВР1 / ВР-1 / Вр-І
//   const vrClass = normalized.match(/вр[-]?[1іi]/i);

//   if (aClass) {
//     className = aClass[0].toUpperCase();
//   } else if (vrClass) {
//     className = 'A240';
//   }
//   console.log('🧩 parseАрматура className:', JSON.stringify(className));
//   // ===== Довжина =====

//   console.log('🧩 parseАрматура lengthMatch:', JSON.stringify(lengthMatch));

//   if (!diameter || !className) {
//     return null;
//   }
//   return {
//     kind: 'rebar',
//     diameter,
//     className,
//     length,
//   };
// }
