import { ParsedSpec } from '../../bom/model/parsed-spec.model';
import { BuiltElement } from '../element.builder';

export function buildChannel(parsed: ParsedSpec): BuiltElement {
  if (parsed.kind !== 'channel') {
    throw new Error('Invalid spec for channel');
  }

  const code = parsed.length
    ? `C_${parsed.height}_${parsed.width}_L${parsed.length}`
    : `C_${parsed.height}_${parsed.width}`;

  const name = parsed.length
    ? `Швелер ${parsed.height}x${parsed.width}, L=${parsed.length}`
    : `Швелер ${parsed.height}x${parsed.width}`;

  return {
    code,
    name,
    type: 'part',
    category: 'channel',
    baseUnit: 'шт',

    height: parsed.height,
    width: parsed.width,
    length: parsed.length,
  };
}
