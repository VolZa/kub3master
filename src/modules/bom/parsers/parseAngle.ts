import { ParsedSpec } from '../model/parsed-spec.model';

export function parseAngle(input: string): ParsedSpec | null {
  // 🔥 шукаємо 100x63x8
  const match = input.match(/(\d+)[xX](\d+)[xX](\d+)/);

  if (!match) return null;

  const width = Number(match[1]);
  const height = Number(match[2]);
  const thickness = Number(match[3]);

  // 🔥 шукаємо довжину
  const lengthMatch = input.match(/l\s*=\s*(\d+)/i);
  const length = lengthMatch ? Number(lengthMatch[1]) : undefined;

  return {
    kind: 'angle',
    width,
    height,
    thickness,
    length,
  };
}
// export function parseAngle(input: string): ParsedSpec | null {
//   const normalized = input
//     .toLowerCase()
//     .replace('х', 'x')
//     .replace(/кутник|l/g, '')
//     .trim();

//   if (!normalized.includes('x')) {
//     return null;
//   }

//   const matches = normalized.match(/\d+/g);
//   console.log('parseAngle matches:', matches);

//   if (!matches) {
//     return { kind: 'unknown' };
//   }

//   const numbers = matches.map(Number);

//   // 🔥 100x63x8 + L=440
//   if (numbers.length >= 4) {
//     const [a, b, t, l] = numbers;

//     return {
//       kind: 'angle',
//       width: a,
//       height: b,
//       thickness: t,
//       length: l, // 🔥 ВАЖЛИВО
//     };
//   }

//   // 100x63x8
//   if (numbers.length === 3) {
//     const [a, b, t] = numbers;

//     return {
//       kind: 'angle',
//       width: a,
//       height: b,
//       thickness: t,
//     };
//   }

//   // 50x5
//   if (numbers.length === 2) {
//     const [a, t] = numbers;

//     return {
//       kind: 'angle',
//       width: a,
//       height: a,
//       thickness: t,
//     };
//   }

//   return { kind: 'unknown' };
// }

// export function parseAngle(input: string): ParsedSpec | null {
//   const normalized = input
//     .toLowerCase()
//     .replace('х', 'x') // кирилична х
//     .replace(/кутник|l/g, '')
//     .trim();
//   // 🔥 ОБОВ’ЯЗКОВА УМОВА
//   if (!normalized.includes('x')) {
//     return null;
//   }
//   // шукаємо всі числа
//   const matches = normalized.match(/\d+/g);
//   console.log('parseAngle matches:', matches);
//   if (!matches) {
//     return { kind: 'unknown' };
//   }

//   const numbers = matches.map(Number);

//   // 50x50x5
//   if (numbers.length === 3) {
//     const [a, b, t] = numbers;

//     return {
//       kind: 'angle',
//       width: a,
//       height: b,
//       thickness: t,
//     };
//   }

//   // 50x5 → припускаємо рівнополочний
//   if (numbers.length === 2) {
//     const [a, t] = numbers;

//     return {
//       kind: 'angle',
//       width: a,
//       height: a,
//       thickness: t,
//     };
//   }

//   return { kind: 'unknown' };
// }
