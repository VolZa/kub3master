import { ParsedSpec } from '../model/parsed-spec.model';

export function parseBeam(input: string): ParsedSpec | null {
  console.log('parseBeam input:', input);
  if (!input.includes('двутавр') && !input.includes('beam')) {
    return null;
  }
  if (!input.includes('x')) return null;

  const sizeMatch = input.match(/(\d+)\s*x\s*(\d+)/);

  if (!sizeMatch) return null;

  const lengthMatch = input.match(/l\s*=\s*(\d+)/);
  const length = lengthMatch ? Number(lengthMatch[1]) : undefined;

  return {
    kind: 'beam',
    height: Number(sizeMatch[1]),
    width: Number(sizeMatch[2]),
    length,
  };
}
