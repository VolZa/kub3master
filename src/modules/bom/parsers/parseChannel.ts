import { ParsedSpec } from '../model/parsed-spec.model';

export function parseChannel(input: string): ParsedSpec | null {
  if (!input.includes('швелер') && !input.includes('channel')) {
    return null;
  }

  if (!input.includes('x')) return null;

  const sizeMatch = input.match(/(\d+)\s*x\s*(\d+)/);

  if (!sizeMatch) return null;

  const lengthMatch = input.match(/l\s*=\s*(\d+)/);
  const length = lengthMatch ? Number(lengthMatch[1]) : undefined;

  return {
    kind: 'channel',
    height: Number(sizeMatch[1]),
    width: Number(sizeMatch[2]),
    length,
  };
}
