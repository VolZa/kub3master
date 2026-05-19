import { ParsedSpec } from '../../bom/model/parsed-spec.model';
import { BuiltElement } from '../element.builder';

export function buildPipeRound(parsed: ParsedSpec): BuiltElement {
  if (parsed.kind !== 'pipe_round') {
    throw new Error('Invalid spec for pipe_round');
  }

  const code = parsed.length
    ? `PR_${parsed.diameter}_${parsed.thickness}_L${parsed.length}`
    : `PR_${parsed.diameter}_${parsed.thickness}`;

  const name = parsed.length
    ? `Труба Ø${parsed.diameter}x${parsed.thickness}, L=${parsed.length}`
    : `Труба Ø${parsed.diameter}x${parsed.thickness}`;

  return {
    code,
    prefixName: 'труба кругла', // 🔥 для Catalog
    name,
    type: 'part',
    category: 'pipe_round',
    baseUnit: 'шт',

    diameter: parsed.diameter,
    thickness: parsed.thickness,
    length: parsed.length,
  };
}
