import { normalizeNumberString } from '../../../../utils/normalize';

export function extractLength(spec: string): number | undefined {
  const match = spec.match(/L\s*=\s*([\d\s,]+)/i);

  if (!match) return undefined;

  return normalizeNumberString(match[1]);
}

export function extractQty(parts: string[]): number {
  const last = parts[parts.length - 1];

  return normalizeNumberString(last);
}

export function normalizeSpec(input: string): string {
  //return input.replace(/(\d)\s+(\d)/g, '$1$2');
  return input
    .replace(/(\d)\s+(\d)/g, '$1$2') // 3 390 → 3390
    .replace(',', '.'); // 0,505 → 0.505
}
