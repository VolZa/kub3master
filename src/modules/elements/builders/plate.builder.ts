import { ELEMENT_TYPES } from '../../../config/config';
import { ParsedSpec } from '../../bom/model/parsed-spec.model';

export function buildPlate(parsed: ParsedSpec) {
  if (parsed.kind !== 'plate') {
    throw new Error('Invalid spec for plate builder');
  }

  return {
    code: `P_${parsed.width}_${parsed.thickness}_${parsed.length}`,
    name: `Полоса ${parsed.width}x${parsed.thickness} L=${parsed.length}`,
    type: ELEMENT_TYPES.PART,
    category: 'plate',
    baseUnit: 'шт',

    width: parsed.width,
    thickness: parsed.thickness,
    length: parsed.length,
  };
}
