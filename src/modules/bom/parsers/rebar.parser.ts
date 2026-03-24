import { ParsedSpec } from '../bom.parser';

export function parseRebar(line: string): ParsedSpec | null {
  const parts = line.split(' ');

  if (parts.length < 2) return null;

  // 12 A500 6000
  if (/^\d+$/.test(parts[0])) {
    return {
      detected: true,
      kind: 'rebar',
      diameter: Number(parts[0]),
      class: parts[1],
      length: Number(parts[2] || 0),
    };
  }

  return null;
}
