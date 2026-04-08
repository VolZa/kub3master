import { ELEMENT_TYPES } from '../../../config/config';
import { ParsedSpec } from '../../bom/model/parsed-spec.model';

export function buildAngle(parsed: ParsedSpec) {
  if (parsed.kind !== 'angle') {
    throw new Error('Invalid spec for angle');
  }

  // 🔥 code БЕЗ довжини
  const code = `A_${parsed.width}_${parsed.height}_${parsed.thickness}`;

  // 🔥 name як у кресленні
  const name = parsed.length
    ? `Кутник L ${parsed.width}x${parsed.height}x${parsed.thickness}, L=${parsed.length}`
    : `Кутник L ${parsed.width}x${parsed.height}x${parsed.thickness}`;

  return {
    code,
    name,
    type: ELEMENT_TYPES.PART,
    category: 'angle',
    baseUnit: 'шт',

    width: parsed.width,
    height: parsed.height,
    thickness: parsed.thickness,
    length: parsed.length,
  };
}
