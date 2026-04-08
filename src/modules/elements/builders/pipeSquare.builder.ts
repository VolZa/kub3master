import { ParsedSpec } from '../../bom/model/parsed-spec.model';
import { BuiltElement } from '../element.builder';

export function buildPipeSquare(parsed: ParsedSpec): BuiltElement {
  if (parsed.kind !== 'pipe_square') {
    throw new Error('Invalid spec for pipe_square');
  }

  const code = parsed.length
    ? `PS_${parsed.width}_${parsed.height}_${parsed.thickness}_L${parsed.length}`
    : `PS_${parsed.width}_${parsed.height}_${parsed.thickness}`;

  const name = parsed.length
    ? `Труба ${parsed.width}x${parsed.height}x${parsed.thickness}, L=${parsed.length}`
    : `Труба ${parsed.width}x${parsed.height}x${parsed.thickness}`;

  return {
    code,
    name,
    type: 'part',
    category: 'pipe_square',
    baseUnit: 'шт',

    width: parsed.width,
    height: parsed.height,
    thickness: parsed.thickness,
    length: parsed.length,
  };
}
