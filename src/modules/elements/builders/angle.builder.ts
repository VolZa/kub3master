import { ELEMENT_TYPES } from '../../../config/config';
import { ParsedSpec } from '../../bom/model/parsed-spec.model';

export function buildAngle(parsed: ParsedSpec) {
  if (parsed.kind !== 'angle') {
    throw new Error('Invalid spec for angle');
  }

  // 🔥 baseCode БЕЗ довжини
  const baseCode = `ANGLE_${parsed.width}_${parsed.height}_${parsed.thickness}`;
  const code = parsed.length ? `${baseCode}_L${parsed.length}` : baseCode;

  // 🔥 name як у кресленні
  const name = parsed.length
    ? `Кутник L ${parsed.width}x${parsed.height}x${parsed.thickness}, L=${parsed.length}`
    : `Кутник L ${parsed.width}x${parsed.height}x${parsed.thickness}`;
  console.log('Building angle with code:', code);
  console.log('Parsed spec:', parsed);
  return {
    code,
    prefixName: 'кутник', // 🔥 для Catalog
    name,
    // type: ELEMENT_TYPES.PART,
    // category: 'angle',
    // baseUnit: 'шт',
    category: 'steel',
    profileType: 'angle',

    width: parsed.width,
    height: parsed.height,
    thickness: parsed.thickness,
    length: parsed.length,
  };
}
