import { ParsedSpec } from '../../bom/model/parsed-spec.model';
import { BuiltElement } from '../element.builder';

export function buildBeam(parsed: ParsedSpec): BuiltElement {
  if (parsed.kind !== 'beam') {
    throw new Error('Invalid spec for beam');
  }

  const code = parsed.length
    ? `B_${parsed.height}_${parsed.width}_L${parsed.length}`
    : `B_${parsed.height}_${parsed.width}`;

  const name = parsed.length
    ? `Двутавр ${parsed.height}x${parsed.width}, L=${parsed.length}`
    : `Двутавр ${parsed.height}x${parsed.width}`;

  return {
    code,
    prefixName: 'двутавр', // 🔥 для Catalog
    name,
    // type: 'part',
    // category: 'beam',
    // baseUnit: 'шт',

    height: parsed.height,
    width: parsed.width,
    length: parsed.length,
  };
}
