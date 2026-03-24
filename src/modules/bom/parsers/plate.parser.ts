import { ParsedSpec } from '../bom.parser';

export function parsePlate(line: string): ParsedSpec | null {
  // Полоса 40x4 2000

  if (!line.includes('ПОЛОС')) return null;

  const match = line.match(/(\d+)[Xx](\d+)\s+(\d+)/);

  if (!match) return null;

  return {
    detected: true,
    kind: 'plate',
    width: Number(match[1]),
    thickness: Number(match[2]),
    length: Number(match[3]),
  };
}
