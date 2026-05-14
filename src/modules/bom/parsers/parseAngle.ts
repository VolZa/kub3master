import { ParsedSpec } from '../model/parsed-spec.model';

export function parseAngle(input: string): ParsedSpec | null {
  const normalized = input
    .toLowerCase()
    .replace('х', 'x') // кирилична х
    .replace(/кутник|l/g, '')
    .trim();
  // 🔥 ОБОВ’ЯЗКОВА УМОВА
  if (!normalized.includes('x')) {
    return null;
  }
  // шукаємо всі числа
  const matches = normalized.match(/\d+/g);
  console.log('parseAngle matches:', matches);
  if (!matches) {
    return { kind: 'unknown' };
  }

  const numbers = matches.map(Number);

  // 50x50x5
  if (numbers.length === 3) {
    const [a, b, t] = numbers;

    return {
      kind: 'angle',
      width: a,
      height: b,
      thickness: t,
    };
  }

  // 50x5 → припускаємо рівнополочний
  if (numbers.length === 2) {
    const [a, t] = numbers;

    return {
      kind: 'angle',
      width: a,
      height: a,
      thickness: t,
    };
  }

  return { kind: 'unknown' };
}
