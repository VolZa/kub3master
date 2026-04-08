import { ParsedSpec } from '../model/parsed-spec.model';

export function parsePipe(input: string): ParsedSpec | null {
  const str = input.toLowerCase().replace(/,/g, '').replace(/\s+/g, ' ').trim();

  // 🔹 1. Довжина
  const lengthMatch = str.match(/l\s*=\s*(\d+)/i);
  const length = lengthMatch ? Number(lengthMatch[1]) : undefined;

  // 🔹 2. ПРОФІЛЬНА ТРУБА (100x50x4)
  const squareMatch = str.match(/(\d+)\s*[xх]\s*(\d+)\s*[xх]\s*(\d+)/i);

  if (squareMatch) {
    const width = Number(squareMatch[1]);
    const height = Number(squareMatch[2]);
    const thickness = Number(squareMatch[3]);

    return {
      kind: 'pipe_square',
      width,
      height,
      thickness,
      length,
    };
  }

  // 🔹 3. КРУГЛА ТРУБА (Ø108x4)
  const roundMatch = str.match(/ø?\s*(\d+)\s*[xх]\s*(\d+)/i);

  if (roundMatch) {
    const diameter = Number(roundMatch[1]);
    const thickness = Number(roundMatch[2]);

    return {
      kind: 'pipe_round',
      diameter,
      thickness,
      length,
    };
  }

  return null;
}
