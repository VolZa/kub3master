import { ParsedSpec } from '../model/parsed-spec.model';

export function parsePlate(input: string): ParsedSpec {
  const normalized = input
    .toLowerCase()
    .replace('х', 'x') // кирилична
    .replace(/мм/g, '')
    .replace(/пластина|лист|полоса/g, '')
    .trim();

  const matches = normalized.match(/\d+/g);

  if (!matches) {
    return { kind: 'unknown' };
  }

  const numbers = matches.map(Number);

  // 200x100x10
  if (numbers.length === 3) {
    const [width, length, thickness] = numbers;

    return {
      kind: 'plate', // пластина / полоса
      thickness,
      width,
      length,
    };
  }

  // 40x5 (полоса)
  if (numbers.length === 2) {
    const [width, thickness] = numbers;

    return {
      kind: 'plate',
      width,
      thickness,
    };
  }

  // тільки товщина (лист 8мм)
  if (numbers.length === 1) {
    return {
      kind: 'plate',
      thickness: numbers[0],
    };
  }

  return { kind: 'unknown' };
}

// import { ParsedSpec } from '../bom.parser';

// export function parsePlate(line: string): ParsedSpec | null {
//   // Полоса 40x4 2000

//   if (!line.includes('ПОЛОС')) return null;

//   const match = line.match(/(\d+)[Xx](\d+)\s+(\d+)/);

//   if (!match) return null;

//   return {
//     detected: true,
//     kind: 'plate',
//     width: Number(match[1]),
//     thickness: Number(match[2]),
//     length: Number(match[3]),
//   };
// }
