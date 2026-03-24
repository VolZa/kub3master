import { ParsedSpec } from '../bom.parser';

export function parseAngle(line: string): ParsedSpec | null {
  // приклад: 50X5 3000 або КУТНИК 50X5 3000

  const match = line.match(/(\d+)[Xx](\d+)\s+(\d+)/);

  if (!match) return null;

  return {
    detected: true,
    kind: 'angle',
    width: Number(match[1]),
    thickness: Number(match[2]),
    length: Number(match[3]),
  };
}
